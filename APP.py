from flask import Flask, render_template, jsonify
from dotenv import load_dotenv
import json
import time
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Cargar .env y API.json desde la carpeta del proyecto, independientemente
# de la carpeta desde la que se inicie Flask.
load_dotenv(BASE_DIR / '.env')

app = Flask(__name__)
# Configuramos la clave secreta de Flask usando el .env (buena práctica de seguridad)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'clave_por_defecto_si_falla')

# Ruta principal que sirve el HTML (Protegida en el futuro por JWT)
@app.route('/')
def dashboard():
    return render_template('index.html')

# API que sirve los datos de telemetría/kanban en menos de 400ms
@app.route('/api/data', methods=['GET'])
def get_data():
    start_time = time.time()
    
    # Leemos el archivo JSON con encoding utf-8 para que no haya errores con la "ñ"
    with (BASE_DIR / 'API.json').open('r', encoding='utf-8') as file:
        db_mock = json.load(file)
    
    # Calculamos el tiempo de respuesta para cumplir el SLA de <400ms
    response_time = (time.time() - start_time) * 1000
    db_mock['metadata']['response_time_ms'] = round(response_time, 2)
    
    return jsonify(db_mock)

if __name__ == '__main__':
    # Modo debug activado para desarrollo
    app.run(debug=True, port=5000)
