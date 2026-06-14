from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class CineLogPagination(PageNumberPagination):
    page_size_query_param = 'page_size'

    def get_paginated_response(self, data):
        return Response({
            'count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'page': self.page.number,
            'page_size': self.get_page_size(self.request),
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data,
        })


class MoviePagination(CineLogPagination):
    page_size = 24
    max_page_size = 100


class CategoryPagination(CineLogPagination):
    page_size = 50
    max_page_size = 500


class InboxPagination(CineLogPagination):
    page_size = 20
    max_page_size = 100
