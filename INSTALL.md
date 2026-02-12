# Guía de Instalación - Py2Rocket Extension

## Paso 1: Instalar dependencias

Abre una terminal en la carpeta `py2rocket-extension` y ejecuta:

```bash
npm install
```

## Paso 2: Probar la extensión en modo desarrollo

1. Abre VS Code en la carpeta `py2rocket-extension`
2. Presiona `F5` para abrir una nueva ventana de VS Code con la extensión cargada
3. En la nueva ventana, abre tu proyecto py2rocket
4. Abre cualquier archivo `.py` de workflow
5. Verás dos iconos nuevos en la barra superior del editor:
   - 🔧 (Build)
   - ☁️ (Build and Push)

## Paso 3: Empaquetar la extensión (opcional)

Si quieres instalar la extensión permanentemente:

```bash
# Instalar vsce (Visual Studio Code Extension manager)
npm install -g vsce

# Empaquetar la extensión
vsce package

# Esto generará un archivo: py2rocket-extension-0.0.1.vsix
```

## Paso 4: Instalar la extensión empaquetada

```bash
code --install-extension py2rocket-extension-0.0.1.vsix
```

O desde VS Code:

1. Ve a la vista de Extensiones (`Ctrl+Shift+X`)
2. Haz clic en el menú `...` (arriba a la derecha)
3. Selecciona "Install from VSIX..."
4. Busca el archivo `.vsix` generado

## Verificación

Para verificar que la extensión está funcionando:

1. Abre un archivo Python de py2rocket (por ejemplo: `workflow.py`)
2. Verifica que aparezcan los botones en la barra del editor
3. Prueba el comando `Py2Rocket: Build` desde la paleta de comandos (`Ctrl+Shift+P`)

## Solución de problemas

### Los comandos no aparecen

- Verifica que estás en un archivo `.py`
- Reinicia VS Code

### Error al ejecutar comandos

- Verifica que `py2rocket` está instalado: `py2rocket --version`
- Verifica que tienes un archivo `.env` configurado con las credenciales de Rocket
- Revisa el panel "Output" > "Py2Rocket" para ver los errores detallados

### La extensión no se activa

- Verifica que no haya errores de sintaxis en `extension.js`
- Revisa la consola de desarrollo: `Help` > `Toggle Developer Tools`
