# website-api - Django Conventions

## Caching Rule

Always use `django.core.cache.cache` to cache model data in API views and clear it on mutations.

### Caching GET responses

```python
from django.core.cache import cache

CACHE_TTL = 300  # 5 minutes

def get(self, request):
    cache_key = f"myapp:mymodel:{pk}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)
    # … query …
    data = MySerializer(instance, context={"request": request}).data
    cache.set(cache_key, data, CACHE_TTL)
    return Response(data)
```

For list endpoints whose results vary by query params, derive a stable key from the sorted params (see `_list_key` in `catalog/views.py`).

### Cache invalidation on mutations

```python
def patch(self, request, pk):
    # … update …
    cache.delete(f"myapp:mymodel:{pk}")
    _invalidate_pattern("myapp:mymodels:*")
    return Response(data)

def delete(self, request, pk):
    cache.delete(f"myapp:mymodel:{pk}")
    _invalidate_pattern("myapp:mymodels:*")
    return Response(status=status.HTTP_204_NO_CONTENT)
```

Use this helper in every `views.py` and `admin.py` that does pattern-based invalidation:

```python
def _invalidate_pattern(pattern):
    """Delete all keys matching a glob pattern (Redis only; silently skipped on LocMemCache)."""
    try:
        cache.delete_pattern(pattern)
    except AttributeError:
        pass
```

### Admin cache invalidation

Override `save_model` and `delete_model` in every `ModelAdmin` class:

```python
def save_model(self, request, obj, form, change):
    super().save_model(request, obj, form, change)
    cache.delete(f"myapp:mymodel:{obj.pk}")
    _invalidate_pattern("myapp:mymodels:*")

def delete_model(self, request, obj):
    cache.delete(f"myapp:mymodel:{obj.pk}")
    _invalidate_pattern("myapp:mymodels:*")
    super().delete_model(request, obj)
```

**Note:** Call `super().save_model(...)` _before_ invalidating; call `super().delete_model(...)` _after_ invalidating.

## Models - Full-Stack Coverage Rule

When adding a **new model** or a **new field to an existing model**, automatically do all of this in the same task:

1. **`admin.py`** - register the model (or add the field to `list_display` / `fields` / `readonly_fields`).
2. **Serializer** - create or update a DRF serializer for the model/field.
3. **View** - create or update the corresponding API view.
4. **URL / endpoint** - wire the view into the router or `urlpatterns`.

**Exception - sensitive fields:** If a field is user-sensitive (passwords, raw tokens, emails, PII), **stop and ask the user** before exposing it in `admin.py` or any endpoint.

Examples requiring confirmation before exposure:

- `password`, `hashed_password`, any password-adjacent field
- `email`, `phone_number`, `date_of_birth`, or other PII
- `token`, `secret`, `api_key`, `refresh_token`
