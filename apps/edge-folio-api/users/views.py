import json
import logging
import uuid

import pdfplumber
from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from pydantic import BaseModel

logger = logging.getLogger(__name__)
from django.core.mail import send_mail
from django.template.loader import render_to_string
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from .models import EmailVerificationToken, PasskeyCredential, PasswordResetToken
from .serializers import (
    ContactInfoSerializer,
    CustomTokenObtainPairSerializer,
    JobSearchPrefsSerializer,
    OnboardingSerializer,
    PasskeyAuthenticationOptionsSerializer,
    PasskeyAuthenticationVerifySerializer,
    PasskeyRegistrationVerifySerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfilePictureSerializer,
    ResendVerificationSerializer,
    ResumeUploadSerializer,
    SignUpSerializer,
    UserProfileSerializer,
    UserProfileUpdateSerializer,
    build_username,
)

WEBAUTHN_CHALLENGE_TTL = 300  # 5 minutes


def _get_rp_id_and_origin():
    return settings.WEBAUTHN_RP_ID, settings.WEBAUTHN_RP_ORIGIN


def _send_verification_email(user, token):
    try:
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        verification_url = f'{frontend_url}/verify-email/{token.token}'
        subject = 'Verify your email address'
        message = render_to_string('users/verification_email.txt', {
            'first_name': user.first_name or user.username,
            'verification_url': verification_url,
            'expiry_hours': settings.EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS,
        })
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email])
        return True
    except Exception:
        return False


def _send_password_reset_email(user, token):
    try:
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        reset_url = f'{frontend_url}/reset-password/{token.token}'
        subject = 'Reset your password'
        message = render_to_string('users/password_reset_email.txt', {
            'first_name': user.first_name or user.username,
            'reset_url': reset_url,
            'expiry_hours': settings.PASSWORD_RESET_TOKEN_EXPIRY_HOURS,
        })
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email])
        return True
    except Exception:
        return False


class SignUpView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token = EmailVerificationToken.objects.create(user=user)
        email_sent = _send_verification_email(user, token)
        return Response(
            {
                'id': user.id,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'email_sent': email_sent,
                'detail': 'Account created. Please verify your email to activate your account.',
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = CustomTokenObtainPairSerializer


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user, context={'request': request})
        return Response(serializer.data)

    def put(self, request):
        serializer = UserProfileUpdateSerializer(
            request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserProfileSerializer(request.user, context={'request': request}).data)

    def delete(self, request):
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfilePictureView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ProfilePictureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.save(user=request.user)
        picture_url = None
        if profile.profile_picture:
            picture_url = request.build_absolute_uri(profile.profile_picture.url)
        return Response({'profile_picture': picture_url})


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            verification = EmailVerificationToken.objects.get(token=token)
        except EmailVerificationToken.DoesNotExist:
            return Response({'detail': 'Invalid or expired token.'}, status=status.HTTP_400_BAD_REQUEST)

        user = verification.user
        if user.is_active:
            verification.delete()
            return Response({'detail': 'Account already verified.'})

        if verification.is_expired():
            verification.delete()
            return Response({'detail': 'Token has expired.'}, status=status.HTTP_400_BAD_REQUEST)

        user.is_active = True
        user.save(update_fields=['is_active'])
        verification.delete()

        # Grant a system-funded JSearch trial so the user can try job search
        # before adding their own key. Never let a provisioning hiccup block
        # account activation.
        try:
            from jobs.trial import grant_trial_credential
            grant_trial_credential(user)
        except Exception as exc:
            logger.warning('Trial credential provisioning failed for user=%s: %s', user.id, exc)

        return Response({'detail': 'Email verified successfully.'})


class ResendVerificationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        generic_response = Response(
            {'detail': 'If the email exists and is unverified, a new link has been sent.'}
        )
        if not serializer.is_valid():
            return generic_response

        email = serializer.validated_data['email']
        try:
            user = User.objects.get(email=email, is_active=False)
            EmailVerificationToken.objects.filter(user=user).delete()
            token = EmailVerificationToken.objects.create(user=user)
            _send_verification_email(user, token)
        except User.DoesNotExist:
            pass
        return generic_response


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        generic_response = Response(
            {'detail': 'If the account exists, a reset link has been sent.'}
        )
        if not serializer.is_valid():
            return generic_response

        user = serializer.get_user()
        PasswordResetToken.objects.filter(user=user).delete()
        token = PasswordResetToken.objects.create(user=user)
        _send_password_reset_email(user, token)
        return generic_response


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token_obj = PasswordResetToken.objects.select_related('user').get(
                token=serializer.validated_data['token']
            )
        except PasswordResetToken.DoesNotExist:
            return Response({'detail': 'Invalid or expired token.'}, status=status.HTTP_400_BAD_REQUEST)

        if token_obj.is_expired():
            token_obj.delete()
            return Response({'detail': 'Token has expired.'}, status=status.HTTP_400_BAD_REQUEST)

        user = token_obj.user
        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        token_obj.delete()
        return Response({'detail': 'Password reset successful.'})


# ── Passkey (WebAuthn) views ─────────────────────────────────────────────────


class OnboardingView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        from .models import UserProfile as UserProfileModel
        profile, _ = UserProfileModel.objects.get_or_create(user=request.user)
        serializer = OnboardingSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserProfileSerializer(request.user, context={'request': request}).data)


class ContactInfoView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ContactInfoSerializer

    def get_object(self):
        from .models import UserProfile as UserProfileModel
        profile, _ = UserProfileModel.objects.get_or_create(user=self.request.user)
        return profile

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        try:
            cache.delete(f'users:profile:{request.user.id}')
        except Exception:
            pass
        return response


class JobSearchPrefsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .models import UserProfile as UserProfileModel
        profile, _ = UserProfileModel.objects.get_or_create(user=request.user)
        return Response(JobSearchPrefsSerializer(profile).data)

    def patch(self, request):
        from .models import UserProfile as UserProfileModel
        profile, _ = UserProfileModel.objects.get_or_create(user=request.user)
        serializer = JobSearchPrefsSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


def _extract_pdf_text(file_obj) -> str:
    text_parts = []
    try:
        with pdfplumber.open(file_obj) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    text_parts.append(text.strip())
    except Exception as exc:
        logger.warning('PDF text extraction failed: %s', exc)
    return '\n'.join(text_parts)


class _ResumeBullet(BaseModel):
    text: str
    category: str


class _ResumeWorkExperience(BaseModel):
    company: str
    title: str
    employment_type: str = 'full_time'
    location: str = ''
    start_date: str = ''
    end_date: str | None = None
    is_current: bool = False
    description: str = ''


class _ResumeEducation(BaseModel):
    institution: str
    degree: str
    field_of_study: str = ''
    start_year: int | None = None
    end_year: int | None = None
    is_current: bool = False
    gpa: float | None = None
    honors: str = ''
    description: str = ''


class _ResumeProject(BaseModel):
    name: str
    url: str = ''
    description: str = ''


class _ResumeParseResult(BaseModel):
    bullets: list[_ResumeBullet] = []
    skills: list[str] = []
    work_experience: list[_ResumeWorkExperience] = []
    education: list[_ResumeEducation] = []
    projects: list[_ResumeProject] = []


def _parse_resume_with_llm(text: str) -> dict:
    from edge_folio_api.llm import chat_structured

    prompt = (
        'You are a resume parser. Extract professional accomplishments, skills, work history, education, and projects.\n\n'
        'Rules:\n'
        '- bullets: one factual sentence under 500 chars describing a verifiable achievement; at most 20\n'
        '- category: impact=business outcome, technical=engineering, leadership=team lead, '
        'collaboration=cross-team, other=else\n'
        '- skills: programming languages, frameworks, tools, cloud platforms only; at most 30\n'
        '- work_experience: one entry per role; start_date/end_date as YYYY-MM-DD (use YYYY-01-01 if only '
        'year known); is_current=true means end_date must be null\n'
        '- education: start_year/end_year as 4-digit integers; is_current=true means end_year must be null\n'
        '- projects: personal or professional projects listed in the resume; name required, url and '
        'description optional (empty string if missing); at most 10\n\n'
        f'Resume:\n{text[:8000]}'
    )
    result = chat_structured(
        messages=[{'role': 'user', 'content': prompt}],
        response_model=_ResumeParseResult,
        temperature=0.1,
    )
    return result.model_dump()


class ResumeUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        import datetime

        from career.models import Education, Project, WorkExperience
        from matrix.models import BulletPoint, Skill

        serializer = ResumeUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        resume_file = serializer.validated_data['resume']

        raw_text = _extract_pdf_text(resume_file)
        if not raw_text.strip():
            return Response(
                {'detail': 'Could not extract text from the uploaded PDF.'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        if not settings.GROQ_API_KEY:
            return Response(
                {'detail': 'Resume analysis is not configured on this server.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            structured = _parse_resume_with_llm(raw_text)
        except Exception as exc:
            logger.warning('Resume analysis failed: %s', exc)
            return Response(
                {'detail': 'Resume analysis failed. Please try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        bullets_data = structured.get('bullets', [])
        skills_data = structured.get('skills', [])
        work_exp_data = structured.get('work_experience', [])
        education_data = structured.get('education', [])
        projects_data = structured.get('projects', [])

        # Upsert skills
        skill_objs: dict[str, Skill] = {}
        for raw_name in skills_data[:30]:
            if not isinstance(raw_name, str):
                continue
            name = raw_name.strip()[:100]
            if not name:
                continue
            obj, _ = Skill.objects.get_or_create(
                user=request.user,
                name=name,
                defaults={'enabled': True, 'proficiency': 3},
            )
            skill_objs[name.lower()] = obj

        # Create bullet points
        valid_categories = {'impact', 'technical', 'leadership', 'collaboration', 'other'}
        base_order = BulletPoint.objects.filter(user=request.user).count()
        bullets_created = 0

        for i, item in enumerate(bullets_data[:20]):
            if not isinstance(item, dict):
                continue
            text = str(item.get('text', '')).strip()
            if not text or len(text) > 500:
                continue
            category = item.get('category', 'other')
            if category not in valid_categories:
                category = 'other'
            bullet = BulletPoint.objects.create(
                user=request.user,
                text=text,
                category=category,
                source='extracted',
                is_approved=False,
                order=base_order + i,
            )
            text_lower = text.lower()
            for skill_key, skill_obj in skill_objs.items():
                if skill_key in text_lower:
                    bullet.skills.add(skill_obj)
            bullets_created += 1

        # Create work experience entries
        valid_employment_types = {'full_time', 'part_time', 'contract', 'freelance', 'internship'}
        work_exp_created = 0

        for item in work_exp_data[:20]:
            if not isinstance(item, dict):
                continue
            company = str(item.get('company', '')).strip()[:200]
            title = str(item.get('title', '')).strip()[:200]
            if not company or not title:
                continue
            raw_start = str(item.get('start_date', '')).strip()
            try:
                start_date = datetime.date.fromisoformat(raw_start)
            except (ValueError, TypeError):
                continue
            is_current = bool(item.get('is_current', False))
            raw_end = item.get('end_date')
            end_date = None
            if not is_current and raw_end:
                try:
                    end_date = datetime.date.fromisoformat(str(raw_end).strip())
                except (ValueError, TypeError):
                    end_date = None
            if not is_current and not end_date:
                continue
            employment_type = str(item.get('employment_type', 'full_time')).strip()
            if employment_type not in valid_employment_types:
                employment_type = 'full_time'
            WorkExperience.objects.create(
                user=request.user,
                company=company,
                title=title,
                employment_type=employment_type,
                location=str(item.get('location', '')).strip()[:200],
                start_date=start_date,
                end_date=end_date,
                is_current=is_current,
                description=str(item.get('description', '')).strip()[:2000],
            )
            work_exp_created += 1

        # Create education entries
        valid_degrees = {'bachelor', 'master', 'phd', 'associate', 'certificate', 'bootcamp', 'other'}
        education_created = 0

        for item in education_data[:10]:
            if not isinstance(item, dict):
                continue
            institution = str(item.get('institution', '')).strip()[:200]
            if not institution:
                continue
            try:
                start_year = int(item.get('start_year', 0))
            except (ValueError, TypeError):
                continue
            if start_year < 1900 or start_year > 2100:
                continue
            is_current = bool(item.get('is_current', False))
            end_year = None
            if not is_current:
                try:
                    end_year = int(item.get('end_year', 0))
                    if end_year < 1900 or end_year > 2100:
                        end_year = None
                except (ValueError, TypeError):
                    end_year = None
            if not is_current and not end_year:
                continue
            degree = str(item.get('degree', 'bachelor')).strip()
            if degree not in valid_degrees:
                degree = 'other'
            raw_gpa = item.get('gpa')
            gpa = None
            if raw_gpa is not None:
                try:
                    gpa_val = float(raw_gpa)
                    if 0.0 <= gpa_val <= 10.0:
                        gpa = gpa_val
                except (ValueError, TypeError):
                    pass
            Education.objects.create(
                user=request.user,
                institution=institution,
                degree=degree,
                field_of_study=str(item.get('field_of_study', '')).strip()[:200],
                start_year=start_year,
                end_year=end_year,
                is_current=is_current,
                gpa=gpa,
                honors=str(item.get('honors', '')).strip()[:100],
                description=str(item.get('description', '')).strip()[:2000],
            )
            education_created += 1

        # Create projects
        projects_created = 0
        base_project_order = Project.objects.filter(user=request.user).count()

        for i, item in enumerate(projects_data[:10]):
            if not isinstance(item, dict):
                continue
            name = str(item.get('name', '')).strip()[:200]
            if not name:
                continue
            url = str(item.get('url', '')).strip()[:300]
            description = str(item.get('description', '')).strip()[:2000]
            Project.objects.create(
                user=request.user,
                name=name,
                url=url,
                description=description,
                order=base_project_order + i,
            )
            projects_created += 1

        try:
            cache.delete(f'matrix:bullets:{request.user.id}')
            cache.delete(f'matrix:skills:{request.user.id}')
            cache.delete(f'career:work_experiences:{request.user.id}')
            cache.delete(f'career:educations:{request.user.id}')
            cache.delete(f'career:projects:{request.user.id}')
        except Exception as exc:
            logger.warning('Cache invalidation failed after resume import: %s', exc)

        return Response(
            {
                'bullets_imported': bullets_created,
                'skills_imported': len(skill_objs),
                'work_experience_imported': work_exp_created,
                'education_imported': education_created,
                'projects_imported': projects_created,
                'extracted_skills': [obj.name for obj in skill_objs.values()],
            },
            status=status.HTTP_201_CREATED,
        )


class PasskeyRegistrationOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        rp_id, rp_origin = _get_rp_id_and_origin()

        existing_credentials = [
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
            for c in PasskeyCredential.objects.filter(user=request.user)
        ]

        options = generate_registration_options(
            rp_id=rp_id,
            rp_name=settings.WEBAUTHN_RP_NAME,
            user_name=request.user.email,
            user_id=str(request.user.id).encode(),
            user_display_name=request.user.get_full_name() or request.user.email,
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.REQUIRED,
                user_verification=UserVerificationRequirement.PREFERRED,
            ),
            exclude_credentials=existing_credentials,
        )

        challenge_id = uuid.uuid4().hex
        cache.set(f'webauthn:reg:{challenge_id}', options.challenge, WEBAUTHN_CHALLENGE_TTL)

        return Response({
            'options': json.loads(options_to_json(options)),
            'challenge_id': challenge_id,
        })


class PasskeyRegistrationVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasskeyRegistrationVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        challenge_id = serializer.validated_data['challenge_id']
        challenge = cache.get(f'webauthn:reg:{challenge_id}')
        if challenge is None:
            return Response(
                {'detail': 'Challenge expired or invalid.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cache.delete(f'webauthn:reg:{challenge_id}')

        rp_id, rp_origin = _get_rp_id_and_origin()

        try:
            verification = verify_registration_response(
                credential=serializer.validated_data['credential'],
                expected_challenge=challenge,
                expected_rp_id=rp_id,
                expected_origin=rp_origin,
            )
        except Exception as e:
            return Response(
                {'detail': f'Registration verification failed: {e}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        credential = PasskeyCredential.objects.create(
            user=request.user,
            credential_id=bytes_to_base64url(verification.credential_id),
            public_key=verification.credential_public_key,
            sign_count=verification.sign_count,
            name=serializer.validated_data.get('name', 'My passkey'),
        )

        return Response(
            {'id': credential.id, 'name': credential.name},
            status=status.HTTP_201_CREATED,
        )


class PasskeyAuthenticationOptionsView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasskeyAuthenticationOptionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        rp_id, rp_origin = _get_rp_id_and_origin()

        allow_credentials = []
        username = build_username(email)
        try:
            user = User.objects.get(username=username, is_active=True)
            allow_credentials = [
                PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
                for c in PasskeyCredential.objects.filter(user=user)
            ]
        except User.DoesNotExist:
            pass

        options = generate_authentication_options(
            rp_id=rp_id,
            allow_credentials=allow_credentials,
            user_verification=UserVerificationRequirement.PREFERRED,
        )

        challenge_id = uuid.uuid4().hex
        cache.set(f'webauthn:auth:{challenge_id}', options.challenge, WEBAUTHN_CHALLENGE_TTL)

        return Response({
            'options': json.loads(options_to_json(options)),
            'challenge_id': challenge_id,
        })


class PasskeyAuthenticationVerifyView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasskeyAuthenticationVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        challenge_id = serializer.validated_data['challenge_id']

        challenge = cache.get(f'webauthn:auth:{challenge_id}')
        if challenge is None:
            return Response(
                {'detail': 'Challenge expired or invalid.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cache.delete(f'webauthn:auth:{challenge_id}')

        rp_id, rp_origin = _get_rp_id_and_origin()

        username = build_username(email)
        try:
            user = User.objects.get(username=username, is_active=True)
        except User.DoesNotExist:
            return Response({'detail': 'Authentication failed.'}, status=status.HTTP_401_UNAUTHORIZED)

        credential_data = serializer.validated_data['credential']
        credential_id_b64 = credential_data.get('id', '')

        try:
            stored = PasskeyCredential.objects.get(credential_id=credential_id_b64, user=user)
        except PasskeyCredential.DoesNotExist:
            return Response({'detail': 'Authentication failed.'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            verification = verify_authentication_response(
                credential=credential_data,
                expected_challenge=challenge,
                expected_rp_id=rp_id,
                expected_origin=rp_origin,
                credential_public_key=bytes(stored.public_key),
                credential_current_sign_count=stored.sign_count,
            )
        except Exception:
            return Response({'detail': 'Authentication failed.'}, status=status.HTTP_401_UNAUTHORIZED)

        stored.sign_count = verification.new_sign_count
        stored.save(update_fields=['sign_count'])

        token = CustomTokenObtainPairSerializer.get_token(user)
        return Response({
            'access': str(token.access_token),
            'refresh': str(token),
        })


class PasskeyCredentialListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        creds = PasskeyCredential.objects.filter(user=request.user).order_by('-created_at')
        return Response({
            'count': creds.count(),
            'credentials': [
                {'id': c.id, 'name': c.name, 'created_at': c.created_at}
                for c in creds
            ],
        })


class PasskeyCredentialDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            cred = PasskeyCredential.objects.get(pk=pk, user=request.user)
        except PasskeyCredential.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        cred.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
