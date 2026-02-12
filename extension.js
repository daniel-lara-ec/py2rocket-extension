const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Ejecuta un comando de py2rocket
 * @param {string} command - El comando a ejecutar
 * @param {string} filePath - Ruta del archivo activo
 * @param {vscode.OutputChannel} outputChannel - Canal de salida
 * @param {string} workingDir - Directorio de trabajo (por defecto el directorio del archivo)
 * @returns {Promise<void>}
 */
function executePy2RocketCommand(command, filePath, outputChannel, workingDir = null) {
    return new Promise((resolve, reject) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No hay una carpeta de trabajo abierta');
            reject(new Error('No workspace folder'));
            return;
        }

        outputChannel.show(true);
        outputChannel.appendLine(`\n${'='.repeat(60)}`);
        outputChannel.appendLine(`Ejecutando: ${command}`);
        outputChannel.appendLine(`Archivo: ${filePath}`);
        outputChannel.appendLine(`${'='.repeat(60)}\n`);

        // Si no se especifica directorio de trabajo, usar el directorio del archivo
        const cwd = workingDir || path.dirname(filePath);

        // Preparar opciones de ejecución
        const execOptions = {
            cwd: cwd,
            shell: true,
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8'
            }
        };

        const venvPath = path.join(workspaceFolder, '.venv', 'Scripts');
        if (fs.existsSync(venvPath)) {
            execOptions.env.PATH = venvPath + path.delimiter + execOptions.env.PATH;
        }

        // Ejecutar el comando en el directorio especificado
        exec(command, execOptions, (error, stdout, stderr) => {
            if (stdout) {
                outputChannel.appendLine(stdout);
            }
            if (stderr) {
                outputChannel.appendLine(`STDERR: ${stderr}`);
            }

            if (error) {
                outputChannel.appendLine(`\nError: ${error.message}`);
                vscode.window.showErrorMessage(`Error ejecutando py2rocket: ${error.message}`);
                reject(error);
            } else {
                outputChannel.appendLine(`\n✓ Comando completado exitosamente`);
                vscode.window.showInformationMessage(`✓ ${command} completado`);
                resolve();
            }
        });
    });
}

/**
 * Obtiene el comando de Python configurado
 * @returns {string}
 */
function getPythonCommand() {
    const config = vscode.workspace.getConfiguration('py2rocket');
    const pythonPath = config.get('pythonPath') || 'python';
    if (pythonPath && pythonPath !== 'python') {
        return quoteIfNeeded(pythonPath);
    }

    const venvPython = findVenvPython();
    if (venvPython) {
        return 'python'; // Usar 'python' directamente si venv está en PATH
    }

    return 'python';
}

/**
 * Busca un ejecutable de Python en .venv del workspace
 * @returns {string|null}
 */
function findVenvPython() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return null;

    const venvRoot = path.join(workspaceFolder, '.venv');
    const windowsPython = path.join(venvRoot, 'Scripts', 'python.exe');
    const unixPython = path.join(venvRoot, 'bin', 'python');

    if (fs.existsSync(windowsPython)) return windowsPython;
    if (fs.existsSync(unixPython)) return unixPython;

    return null;
}

/**
 * Envuelve en comillas si hay espacios
 * @param {string} value
 * @returns {string}
 */
function quoteIfNeeded(value) {
    if (!value) return value;
    if (value.includes(' ') && !value.startsWith('"')) {
        return `"${value}"`;
    }
    return value;
}

/**
 * Obtiene la ruta del archivo activo
 * @returns {string|null}
 */
function getActiveFilePath() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No hay archivo activo');
        return null;
    }

    const filePath = editor.document.uri.fsPath;
    if (!filePath.endsWith('.py')) {
        vscode.window.showWarningMessage('El archivo activo no es un archivo Python');
        return null;
    }

    return filePath;
}

/**
 * Detecta si el workspace actual proviene de una sincronización y devuelve metadatos
 * @returns {{isSynced: boolean, metadata: any | null, error: string | null}}
 */
function detectSyncWorkspace() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        return { isSynced: false, metadata: null, error: 'No hay carpeta de trabajo abierta' };
    }

    const metadataPath = path.join(workspaceFolder, '.py2rocket');
    if (!fs.existsSync(metadataPath)) {
        return { isSynced: false, metadata: null, error: null };
    }

    try {
        const content = fs.readFileSync(metadataPath, 'utf-8');
        const metadata = JSON.parse(content);
        return { isSynced: true, metadata, error: null };
    } catch (error) {
        return { isSynced: false, metadata: null, error: error?.message || 'Error leyendo .py2rocket' };
    }
}

/**
 * Comando: Build
 * Compila el archivo Python actual a JSON usando py2rocket build
 */
async function buildCommand(outputChannel) {
    const filePath = getActiveFilePath();
    if (!filePath) return;

    // Guardar el archivo antes de compilar
    await vscode.window.activeTextEditor.document.save();

    const fileName = path.basename(filePath);
    const pythonCommand = getPythonCommand();
    const command = `${pythonCommand} -m py2rocket build "${fileName}"`;

    try {
        // Ejecutar desde el directorio del archivo
        await executePy2RocketCommand(command, filePath, outputChannel, path.dirname(filePath));

        // Intentar abrir el archivo JSON generado
        const jsonPath = filePath.replace('.py', '.json');
        if (fs.existsSync(jsonPath)) {
            const doc = await vscode.workspace.openTextDocument(jsonPath);
            await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
        }
    } catch (error) {
        console.error('Error en build:', error);
    }
}

/**
 * Comando: Build and Push
 * Compila el archivo Python y lo despliega a Rocket
 */
async function buildAndPushCommand(outputChannel) {
    const filePath = getActiveFilePath();
    if (!filePath) return;

    // Guardar el archivo antes de compilar
    await vscode.window.activeTextEditor.document.save();

    const fileName = path.basename(filePath);
    const fileNameWithoutExt = path.basename(filePath, '.py');
    const jsonFileName = `${fileNameWithoutExt}.json`;
    const pythonCommand = getPythonCommand();
    const fileDir = path.dirname(filePath);

    try {
        // Paso 1: Build
        outputChannel.appendLine('Paso 1/2: Building...');
        const buildCommand = `${pythonCommand} -m py2rocket build "${fileName}"`;
        await executePy2RocketCommand(buildCommand, filePath, outputChannel, fileDir);

        // Paso 2: Push
        outputChannel.appendLine('\nPaso 2/2: Pushing to Rocket...');
        const pushCommand = `${pythonCommand} -m py2rocket push "${jsonFileName}"`;
        await executePy2RocketCommand(pushCommand, filePath, outputChannel, fileDir);

        vscode.window.showInformationMessage(`✓ Build and Push completado: ${fileNameWithoutExt}`);
    } catch (error) {
        console.error('Error en build and push:', error);
    }
}

/**
 * Comando: Build and Push Silent
 * Compila y despliega sin abrir el archivo JSON
 */
async function buildAndPushSilentCommand(outputChannel) {
    const filePath = getActiveFilePath();
    if (!filePath) return;

    // Guardar el archivo antes de compilar
    await vscode.window.activeTextEditor.document.save();

    const fileName = path.basename(filePath);
    const fileNameWithoutExt = path.basename(filePath, '.py');
    const jsonFileName = `${fileNameWithoutExt}.json`;
    const pythonCommand = getPythonCommand();
    const fileDir = path.dirname(filePath);

    try {
        // Paso 1: Build
        outputChannel.appendLine('Paso 1/2: Building...');
        const buildCommand = `${pythonCommand} -m py2rocket build "${fileName}"`;
        await executePy2RocketCommand(buildCommand, filePath, outputChannel, fileDir);

        // Paso 2: Push
        outputChannel.appendLine('\nPaso 2/2: Pushing to Rocket...');
        const pushCommand = `${pythonCommand} -m py2rocket push "${jsonFileName}"`;
        await executePy2RocketCommand(pushCommand, filePath, outputChannel, fileDir);

        vscode.window.showInformationMessage(`✓ Push completado: ${fileNameWithoutExt}`);
    } catch (error) {
        console.error('Error en build and push:', error);
    }
}

/**
 * Comando: Render
 * Renderiza el grafo del workflow usando py2rocket render
 */
async function renderCommand(outputChannel, context) {
    const filePath = getActiveFilePath();
    if (!filePath) return;

    // Guardar el archivo antes de renderizar
    await vscode.window.activeTextEditor.document.save();

    const fileName = path.basename(filePath);
    const pythonCommand = getPythonCommand();
    const fileDir = path.dirname(filePath);

    return new Promise((resolve, reject) => {
        outputChannel.show(true);
        outputChannel.appendLine(`\n${'='.repeat(60)}`);
        outputChannel.appendLine(`Renderizando grafo: ${fileName}`);
        outputChannel.appendLine(`${'='.repeat(60)}\n`);

        const command = `${pythonCommand} -m py2rocket render "${fileName}"`;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        const execOptions = {
            cwd: fileDir,
            shell: true,
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8'
            }
        };

        const venvPath = path.join(workspaceFolder, '.venv', 'Scripts');
        if (fs.existsSync(venvPath)) {
            execOptions.env.PATH = venvPath + path.delimiter + execOptions.env.PATH;
        }

        exec(command, execOptions, (error, stdout, stderr) => {
            if (stdout) {
                outputChannel.appendLine(stdout);
            }
            if (stderr && !stderr.includes('DeprecationWarning')) {
                outputChannel.appendLine(`STDERR: ${stderr}`);
            }

            if (error) {
                outputChannel.appendLine(`\nError: ${error.message}`);
                vscode.window.showErrorMessage(`Error renderizando grafo: ${error.message}`);
                reject(error);
            } else {
                try {
                    // Intentar parsear la salida JSON (soporta JSON multilínea)
                    const trimmed = (stdout || '').trim();
                    let graphData = null;

                    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                        graphData = JSON.parse(trimmed);
                    } else {
                        const start = trimmed.indexOf('{');
                        const end = trimmed.lastIndexOf('}');
                        if (start !== -1 && end !== -1 && end > start) {
                            const jsonBlock = trimmed.slice(start, end + 1);
                            graphData = JSON.parse(jsonBlock);
                        }
                    }

                    if (graphData) {
                        outputChannel.appendLine(`\n✓ Grafo obtenido exitosamente`);
                        createGraphWebView(graphData, context, fileName);
                        resolve();
                    } else {
                        throw new Error('No se encontró JSON en la salida');
                    }
                } catch (parseError) {
                    outputChannel.appendLine(`\nError parseando JSON: ${parseError.message}`);
                    vscode.window.showErrorMessage(`Error parseando datos del grafo: ${parseError.message}`);
                    reject(parseError);
                }
            }
        });
    });
}

/**
 * Crea un WebView panel para mostrar el grafo
 * @param {Object} graphData - Datos del grafo con nodes y edges
 * @param {vscode.ExtensionContext} context - Contexto de la extensión
 * @param {string} fileName - Nombre del archivo
 */
function createGraphWebView(graphData, context, fileName) {
    const panel = vscode.window.createWebviewPanel(
        'py2rocketGraph',
        `Grafo: ${fileName}`,
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = getGraphHtml(graphData, fileName);
}

/**
 * Genera el HTML para el WebView del grafo
 * @param {Object} graphData - Datos del grafo
 * @param {string} fileName - Nombre del archivo
 * @returns {string}
 */
function getGraphHtml(graphData, fileName) {
    const nodes = graphData.nodes || [];
    const edges = graphData.edges || [];

    // Definir colores por tipo de nodo
    const nodeColors = {
        'reader': '#4CAF50',
        'writer': '#F44336',
        'map': '#2196F3',
        'filter': '#FF9800',
        'join': '#9C27B0',
        'aggregate': '#00BCD4',
        'transform': '#FFC107',
        'default': '#757575'
    };

    // Transformar nodos para vis-network
    const visNodes = nodes.map(node => ({
        id: node.id,
        label: node.id,
        color: nodeColors[node.type] || nodeColors.default,
        shape: node.type === 'reader' ? 'box' :
            node.type === 'writer' ? 'box' :
                'ellipse',
        font: { color: '#ffffff', size: 14, bold: true },
        title: `Tipo: ${node.type}`
    }));

    // Transformar edges para vis-network
    const visEdges = edges.map((edge, index) => ({
        id: index,
        from: edge.source,
        to: edge.target,
        arrows: 'to',
        color: { color: '#848484', highlight: '#2196F3' },
        width: 2,
        smooth: { type: 'cubicBezier' }
    }));

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grafo: ${fileName}</title>
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        #header {
            padding: 15px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        #header h2 {
            margin: 0;
            color: var(--vscode-editor-foreground);
        }
        #stats {
            margin-top: 10px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        #mynetwork {
            width: 100%;
            height: calc(100vh - 100px);
            background-color: var(--vscode-editor-background);
        }
        .legend {
            position: absolute;
            top: 80px;
            right: 20px;
            background-color: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 10px;
            border-radius: 5px;
            font-size: 12px;
        }
        .legend-item {
            margin: 5px 0;
            display: flex;
            align-items: center;
        }
        .legend-color {
            width: 20px;
            height: 20px;
            margin-right: 8px;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <div id="header">
        <h2>📊 Grafo del Workflow: ${fileName}</h2>
        <div id="stats">
            <span>Nodos: ${nodes.length}</span> | 
            <span>Conexiones: ${edges.length}</span>
        </div>
    </div>
    
    <div class="legend">
        <div style="font-weight: bold; margin-bottom: 8px;">Tipos de Nodo</div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: ${nodeColors.reader}"></div>
            <span>Reader</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: ${nodeColors.writer}"></div>
            <span>Writer</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: ${nodeColors.map}"></div>
            <span>Map</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: ${nodeColors.filter}"></div>
            <span>Filter</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: ${nodeColors.join}"></div>
            <span>Join</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: ${nodeColors.aggregate}"></div>
            <span>Aggregate</span>
        </div>
    </div>
    
    <div id="mynetwork"></div>
    
    <script type="text/javascript">
        const nodes = new vis.DataSet(${JSON.stringify(visNodes)});
        const edges = new vis.DataSet(${JSON.stringify(visEdges)});
        
        const container = document.getElementById('mynetwork');
        const data = { nodes: nodes, edges: edges };
        
        const options = {
            layout: {
                hierarchical: {
                    direction: 'LR',
                    sortMethod: 'directed',
                    levelSeparation: 200,
                    nodeSpacing: 150
                }
            },
            physics: {
                enabled: false
            },
            edges: {
                smooth: {
                    type: 'cubicBezier',
                    forceDirection: 'horizontal',
                    roundness: 0.4
                }
            },
            interaction: {
                hover: true,
                navigationButtons: true,
                keyboard: true
            }
        };
        
        const network = new vis.Network(container, data, options);
        
        // Evento de click en nodos
        network.on('click', function(params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const node = nodes.get(nodeId);
                console.log('Nodo seleccionado:', node);
            }
        });
    </script>
</body>
</html>`;
}

/**
 * Activación de la extensión
 */
function activate(context) {
    console.log('Activando extensión py2rocket-extension');

    // Crear canal de salida
    const outputChannel = vscode.window.createOutputChannel('Py2Rocket');

    // Crear item en barra de estado
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'py2rocket.build';
    statusBarItem.text = 'Py2Rocket';
    statusBarItem.tooltip = 'Py2Rocket: Workspace no sincronizado';
    statusBarItem.show();

    // Detectar si el workspace actual proviene de una sincronización
    const syncDetection = detectSyncWorkspace();
    if (syncDetection.isSynced) {
        const syncInfo = syncDetection.metadata?.sync_info || {};
        const projectName = syncInfo.project_name || 'Proyecto desconocido';
        const groupName = syncInfo.group_name || 'Grupo desconocido';
        const syncDate = syncInfo.sync_date || 'Fecha desconocida';

        outputChannel.appendLine('✓ Workspace detectado como sincronizado (.py2rocket)');
        outputChannel.appendLine(`  - Proyecto: ${projectName}`);
        outputChannel.appendLine(`  - Grupo: ${groupName}`);
        outputChannel.appendLine(`  - Última sincronización: ${syncDate}`);

        statusBarItem.text = 'Py2Rocket $(cloud)';
        statusBarItem.tooltip = `Py2Rocket sincronizado\nProyecto: ${projectName}\nGrupo: ${groupName}\nÚltima sync: ${syncDate}`;

        vscode.commands.executeCommand('setContext', 'py2rocket.isSynced', true);
    } else {
        vscode.commands.executeCommand('setContext', 'py2rocket.isSynced', false);
        if (syncDetection.error) {
            outputChannel.appendLine(`⚠️  No se pudo leer .py2rocket: ${syncDetection.error}`);
        }

        statusBarItem.text = 'Py2Rocket $(circle-slash)';
        statusBarItem.tooltip = 'Py2Rocket: Workspace no sincronizado';
    }

    // Registrar comando: Build
    const buildDisposable = vscode.commands.registerCommand('py2rocket.build', () => {
        buildCommand(outputChannel);
    });

    // Registrar comando: Build and Push
    const buildAndPushDisposable = vscode.commands.registerCommand('py2rocket.buildAndPush', () => {
        buildAndPushCommand(outputChannel);
    });

    // Registrar comando: Push (Build and Push Silent)
    const pushDisposable = vscode.commands.registerCommand('py2rocket.push', () => {
        buildAndPushSilentCommand(outputChannel);
    });

    // Registrar comando: Render
    const renderDisposable = vscode.commands.registerCommand('py2rocket.render', () => {
        renderCommand(outputChannel, context);
    });

    context.subscriptions.push(buildDisposable);
    context.subscriptions.push(buildAndPushDisposable);
    context.subscriptions.push(pushDisposable);
    context.subscriptions.push(renderDisposable);
    context.subscriptions.push(outputChannel);
    context.subscriptions.push(statusBarItem);

    outputChannel.appendLine('Py2Rocket Extension activada correctamente');
}

/**
 * Desactivación de la extensión
 */
function deactivate() {
    console.log('Desactivando extensión py2rocket-extension');
}

module.exports = {
    activate,
    deactivate
};
