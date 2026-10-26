SIGNAGE_CLIENT = 'signage'
SIGNAGE_ROLES = ('view', 'setup', 'exams', 'media', 'power', 'onair', 'emergency', 'devices')


def signage_roles(token) -> set:
    """Known roles of the Keycloak client `signage`; the composite `admin` grants all."""
    if not isinstance(token, dict):
        return set()
    access = token.get('resource_access')
    client = access.get(SIGNAGE_CLIENT) if isinstance(access, dict) else None
    roles = client.get('roles') if isinstance(client, dict) else None
    if not isinstance(roles, list):
        return set()
    if 'admin' in roles:
        return set(SIGNAGE_ROLES)
    return {r for r in roles if r in SIGNAGE_ROLES}


def signage_permission_codes(roles) -> list:
    return sorted(f'signage.{r}' for r in roles)


def without_signage_codes(codes) -> set:
    """Drops stored `signage.*` codes: those rights come from the token only."""
    return {c for c in codes if not c.startswith('signage.')}
