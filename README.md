# PulseMarket - Dashboard Kanban Persistente 🚀

PulseMarket es una plataforma web de gestión de tareas basada en la metodología Kanban. Incluye autenticación segura OAuth 2.0 con Google, comunicación asíncrona mediante `fetch` API y persistencia de datos en tiempo real respaldada por un almacenamiento JSON local.

## 🛠️ Tecnologías Utilizadas

* **Backend:** Python, Flask, Authlib, Python-dotenv.
* **Frontend:** HTML5, Tailwind CSS, JavaScript ES6 (Custom Drag & Drop API).
* **Base de Datos:** Almacenamiento basado en JSON (`API.json`).
* **Seguridad:** OAuth 2.0 (Google OpenID Connect) y aislamiento de credenciales mediante variables de entorno (`.env`).

## 📋 Características Principales

* **Autenticación OAuth 2.0:** Control de acceso público/protegido para garantizar la seguridad de la información.
* **Tablero Kanban Dinámico:** Organizado en columnas ("Por Hacer", "En Progreso", "Completado").
* **Drag & Drop con Persistencia Real:** Actualización en tiempo real del estado de las tareas mediante llamadas asíncronas POST sin recargar la página.
* **Creador de Tareas:** Formulario integrado para la inserción instantánea de tarjetas con asignación automática de ID.
* **Monitoreo de Rendimiento:** Métrica visual en tiempo real de los tiempos de respuesta del servidor (SLA).

## 🔧 Instalación y Configuración Local

### 1. Clonar el repositorio
```bash
git clone [https://github.com/alanyair123/Proyecto.git](https://github.com/alanyair123/Proyecto.git)
cd Proyecto
