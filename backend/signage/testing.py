"""Test helper: grants signage permission codes through the roles of a mocked Keycloak token."""


def grant_roles(token: dict, *codes: str) -> None:
    roles = token.setdefault('resource_access', {}).setdefault('signage', {}).setdefault('roles', [])
    roles.extend(c.removeprefix('signage.') for c in codes)
