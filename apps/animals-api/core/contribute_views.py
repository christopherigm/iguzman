"""The public contribute endpoints' shared view.

One POST-only view, subclassed twice (a species in ``catalog/views.py``, a
sighting in ``journal/views.py``). It is deliberately **not** a method on
``CachedListCreateView``: that class's ``get_permissions`` is what makes every
write on every resource administrator-only, and the one thing this feature must
not do is loosen it. A separate URL with a separate permission and a separate
serializer is the whole safety argument - there is no path by which widening this
widens anything else.
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .cache import invalidate
from .permissions import IsContributor

__all__ = ['ContributeView']


class ContributeView(APIView):
    """POST one pending record from a signed-in reader.

    A subclass sets ``serializer_class`` (a ``core.contributions``
    ``ContributionSerializer``), ``response_serializer_class`` (the record's
    normal read serializer, so the frontend gets the same shape back that every
    other read gives it), and ``cache_prefixes``.

    **Nothing here is cached, and the write invalidates almost nothing.** A
    contribution lands ``enabled=False``, so it is absent from every cached public
    payload by construction - the namespaces are cleared anyway, because a
    reviewer's CMS list is read through the same endpoints with
    ``include_disabled=true`` and *that* entry has to appear immediately.
    """

    permission_classes = [IsContributor]

    serializer_class = None
    response_serializer_class = None
    cache_prefixes = ()

    def post(self, request):
        serializer = self.serializer_class(
            data=request.data, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()

        if self.cache_prefixes:
            invalidate(*self.cache_prefixes)

        return Response(
            self.response_serializer_class(instance, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )
