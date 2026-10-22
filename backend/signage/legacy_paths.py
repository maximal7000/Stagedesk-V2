"""Permanent alias for the old API address: /api/monitor/... is served by the /api/signage/... router.

Installed Raspberry Pis, bookmarks and the published install command still use /api/monitor/.
Only this one prefix is rewritten; everything else passes through unchanged."""

LEGACY_PREFIX = '/api/monitor/'
CURRENT_PREFIX = '/api/signage/'


class LegacyPathMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path_info.startswith(LEGACY_PREFIX):
            request.path_info = CURRENT_PREFIX + request.path_info[len(LEGACY_PREFIX):]
        return self.get_response(request)
