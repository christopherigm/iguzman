from rest_framework import serializers

from .models import Mod


class ModSerializer(serializers.ModelSerializer):
    fabric_jar_url = serializers.SerializerMethodField()
    neoforge_jar_url = serializers.SerializerMethodField()

    class Meta:
        model = Mod
        fields = [
            'id',
            'prompt',
            'llm_model',
            'mod_id',
            'mod_name',
            'description',
            'main_class',
            'status',
            'build_log',
            'error',
            'fabric_jar_url',
            'neoforge_jar_url',
            'created',
            'modified',
        ]
        read_only_fields = [
            'id', 'mod_id', 'mod_name', 'description', 'main_class',
            'status', 'build_log', 'error',
            'fabric_jar_url', 'neoforge_jar_url',
            'created', 'modified',
        ]

    def get_fabric_jar_url(self, obj):
        if not obj.fabric_jar:
            return None
        request = self.context.get('request')
        url = obj.fabric_jar.url
        return request.build_absolute_uri(url) if request else url

    def get_neoforge_jar_url(self, obj):
        if not obj.neoforge_jar:
            return None
        request = self.context.get('request')
        url = obj.neoforge_jar.url
        return request.build_absolute_uri(url) if request else url


class ModCreateSerializer(serializers.Serializer):
    prompt = serializers.CharField(min_length=10, max_length=2000)
    llm_model = serializers.CharField(
        max_length=100,
        default='llama-3.3-70b-versatile',
        required=False,
    )
