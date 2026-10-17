import pytest
from APP import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

# Prueba 1: Verificar que la página principal carga
def test_dashboard_carga(client):
    response = client.get('/')
    assert response.status_code == 200

# Prueba 2: Verificar que la API de telemetría responde rápido y tiene el formato correcto
def test_api_datos(client):
    response = client.get('/api/data')
    datos = response.get_json()
    
    assert response.status_code == 200
    assert datos['status'] == 'success'
    assert 'metadata' in datos
    assert len(datos['data']) > 0