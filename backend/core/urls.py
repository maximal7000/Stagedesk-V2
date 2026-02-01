"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from ninja import NinjaAPI

from haushalte.api import haushalte_router, kategorien_router
from users.api import users_router
from kalender.api import kalender_router
from inventar.api import inventar_router

# Django Ninja API-Instanz
api = NinjaAPI(
    title="Stagedesk API",
    version="1.0.0",
    description="Haushalts- und Budget-Management API"
)


@api.get("/health")
def health_check(request):
    """Einfacher Health-Check-Endpoint"""
    return {"status": "ok"}


# Router hinzufügen
api.add_router("/haushalte", haushalte_router)
api.add_router("/kategorien", kategorien_router)
api.add_router("/users", users_router)
api.add_router("/kalender", kalender_router)
api.add_router("/inventar", inventar_router)


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', api.urls),
]
