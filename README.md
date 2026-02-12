# Py2Rocket VS Code Extension

Extensión de Visual Studio Code para trabajar con workflows de Py2Rocket.

## Características

Esta extensión proporciona dos comandos principales para trabajar con archivos Python de Py2Rocket:

### 🔨 Build

Compila el archivo Python actual a formato JSON usando `py2rocket build`.

- **Comando:** `Py2Rocket: Build`
- **Icono:** 🔧 (aparece en la barra del editor)
- **Acción:** Compila el archivo `.py` activo y genera un archivo `.json` correspondiente
- **Resultado:** Muestra el JSON generado en una nueva pestaña

### 🚀 Build and Push

Compila el archivo Python y lo despliega directamente a Rocket.

- **Comando:** `Py2Rocket: Build and Push`
- **Icono:** ☁️ (aparece en la barra del editor)
- **Acción:**
  1. Compila el archivo `.py` a JSON
  2. Despliega el workflow a Rocket usando `py2rocket push`
- **Resultado:** Workflow desplegado y listo para usar en Rocket

## Requisitos

- Python instalado con el paquete `py2rocket`
- Variables de entorno configuradas en `.env` (ROCKET_URL, ROCKET_API_KEY, etc.)
- Archivo Python válido de Py2Rocket abierto en el editor

## Uso

### Desde la barra del editor

Cuando tengas un archivo Python abierto, verás dos iconos en la barra superior derecha:

- 🔧 Build
- ☁️ Build and Push

Simplemente haz clic en el botón que necesites.

### Desde la paleta de comandos

1. Presiona `Ctrl+Shift+P` (Windows/Linux) o `Cmd+Shift+P` (Mac)
2. Escribe "Py2Rocket"
3. Selecciona el comando deseado:
   - `Py2Rocket: Build`
   - `Py2Rocket: Build and Push`

### Desde el menú contextual

1. Haz clic derecho en el editor con un archivo Python abierto
2. Busca las opciones de Py2Rocket en el menú
3. Selecciona el comando deseado

## Salida

Todos los comandos muestran su salida en el panel "OUTPUT" de VS Code, en el canal "Py2Rocket". Para verlo:

1. Presiona `Ctrl+Shift+U` para abrir el panel Output
2. Selecciona "Py2Rocket" en el desplegable

## Instalación para desarrollo

1. Copia la carpeta `py2rocket-extension` en tu proyecto
2. Abre la carpeta en VS Code
3. Presiona `F5` para abrir una nueva ventana de VS Code con la extensión cargada
4. Abre un archivo Python de Py2Rocket y prueba los comandos

## Empaquetado

Para empaquetar la extensión:

```bash
npm install -g vsce
cd py2rocket-extension
vsce package
```

Esto generará un archivo `.vsix` que puedes instalar con:

```bash
code --install-extension py2rocket-extension-0.0.1.vsix
```

## Problemas conocidos

- La extensión asume que `py2rocket` está disponible en el PATH del sistema
- Los archivos deben estar guardados antes de ejecutar los comandos

## Contribuir

Para contribuir al desarrollo de esta extensión:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Añade nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## Licencia

Ver el archivo LICENSE en el directorio raíz del proyecto.
