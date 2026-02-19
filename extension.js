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
 * Normaliza rutas de grupo usando separador '/'
 * @param {string} value
 * @returns {{normalized: string, leadingSlash: boolean}}
 */
function normalizeGroupPath(value) {
    const trimmed = (value || '').trim();
    const leadingSlash = trimmed.startsWith('/');
    const normalized = trimmed
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .join('/');
    return { normalized, leadingSlash };
}

/**
 * Divide ruta de grupo en partes seguras
 * @param {string} value
 * @returns {string[]}
 */
function splitGroupPath(value) {
    const { normalized } = normalizeGroupPath(value);
    if (!normalized) return [];
    return normalized.split('/');
}

/**
 * Valida que no haya segmentos peligrosos
 * @param {string[]} parts
 * @returns {boolean}
 */
function isSafeGroupParts(parts) {
    return parts.every(part => part && part !== '.' && part !== '..');
}

/**
 * Construye el nombre completo del grupo
 * @param {string} baseGroupName
 * @param {string} input
 * @returns {string}
 */
function buildFullGroupName(baseGroupName, input) {
    const baseInfo = normalizeGroupPath(baseGroupName);
    const inputInfo = normalizeGroupPath(input);

    if (!inputInfo.normalized) {
        return baseInfo.leadingSlash ? `/${baseInfo.normalized}` : baseInfo.normalized;
    }

    let full = inputInfo.normalized;
    if (baseInfo.normalized && !inputInfo.normalized.startsWith(baseInfo.normalized)) {
        full = [baseInfo.normalized, inputInfo.normalized].filter(Boolean).join('/');
    }

    const leadingSlash = baseInfo.leadingSlash || inputInfo.leadingSlash;
    return leadingSlash ? `/${full}` : full;
}

/**
 * Resuelve la carpeta local del grupo completo en el workspace
 * @param {string} workspaceFolder
 * @param {string} baseGroupName
 * @param {string} fullGroupName
 * @returns {string}
 */
function resolveLocalGroupDir(workspaceFolder, baseGroupName, fullGroupName) {
    const baseParts = splitGroupPath(baseGroupName);
    const fullParts = splitGroupPath(fullGroupName);
    let relParts = fullParts;

    if (baseParts.length > 0) {
        const basePrefix = fullParts.slice(0, baseParts.length).join('/');
        if (basePrefix === baseParts.join('/')) {
            relParts = fullParts.slice(baseParts.length);
        }
    }

    if (relParts.length === 0) return workspaceFolder;
    return path.join(workspaceFolder, ...relParts);
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
 * Comando: Download
 * Descarga el workflow desde el servidor y lo convierte a Python
 */
async function downloadCommand(outputChannel) {
    const filePath = getActiveFilePath();
    if (!filePath) return;

    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const workflowId = extractWorkflowId(fileContent);

        if (!workflowId) {
            vscode.window.showErrorMessage('No se encontró workflow_id en el archivo');
            return;
        }

        const fileName = path.basename(filePath);
        const fileNameWithoutExt = path.basename(filePath, '.py');
        const fileDir = path.dirname(filePath);
        const pythonCommand = getPythonCommand();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        outputChannel.show(true);
        outputChannel.appendLine(`\n${'='.repeat(60)}`);
        outputChannel.appendLine(`Descargando workflow: ${workflowId}`);
        outputChannel.appendLine(`Archivo: ${fileName}`);
        outputChannel.appendLine(`${'='.repeat(60)}\n`);

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

        const { execSync } = require('child_process');

        try {
            // Paso 1: Descargar el workflow
            outputChannel.appendLine('Paso 1/3: Descargando del servidor...');
            const downloadCmd = `${pythonCommand} -m py2rocket download "${workflowId}"`;
            const downloadOutput = execSync(downloadCmd, {
                ...execOptions,
                encoding: 'utf-8'
            });
            outputChannel.appendLine(downloadOutput);

            // Paso 2: Detectar el archivo JSON descargado
            const jsonFiles = fs.readdirSync(fileDir).filter(f =>
                f.endsWith('.json')
            );

            if (jsonFiles.length === 0) {
                throw new Error('No se encontró ningún archivo JSON descargado. Verifica que el download se completó sin errores.');
            }

            // Si hay múltiples JSON, tomar el más reciente (el que acaba de descargarse)
            let downloadedJsonFile = jsonFiles[0];
            if (jsonFiles.length > 1) {
                const fileStats = jsonFiles.map(f => ({
                    file: f,
                    time: fs.statSync(path.join(fileDir, f)).mtime.getTime()
                }));
                downloadedJsonFile = fileStats.sort((a, b) => b.time - a.time)[0].file;
            }
            outputChannel.appendLine(`\nPaso 2/3: Convirtiendo JSON a Python...`);

            // Paso 3: Convertir JSON a Python usando from-json
            const fromJsonCmd = `${pythonCommand} -m py2rocket from-json "${downloadedJsonFile}" -o "${fileName}"`;
            const fromJsonOutput = execSync(fromJsonCmd, {
                ...execOptions,
                encoding: 'utf-8'
            });
            outputChannel.appendLine(fromJsonOutput);

            // Paso 4: Eliminar el archivo JSON descargado
            outputChannel.appendLine(`\nPaso 3/3: Limpiando archivos temporales...`);
            const jsonPath = path.join(fileDir, downloadedJsonFile);
            fs.unlinkSync(jsonPath);
            outputChannel.appendLine(`✓ Archivo JSON eliminado: ${downloadedJsonFile}`);

            outputChannel.appendLine(`\n${'='.repeat(60)}`);
            outputChannel.appendLine(`✓ Workflow descargado y convertido exitosamente`);
            outputChannel.appendLine(`✓ Archivo: ${fileName}`);
            outputChannel.appendLine(`${'='.repeat(60)}\n`);

            vscode.window.showInformationMessage(`✓ Workflow descargado y convertido a Python`);

            // Recargar el archivo para mostrar los cambios
            await vscode.commands.executeCommand('workbench.action.files.revert');

        } catch (error) {
            outputChannel.appendLine(`\n❌ Error: ${error.message}`);
            vscode.window.showErrorMessage(`Error al descargar workflow: ${error.message}`);
        }
    } catch (error) {
        outputChannel.appendLine(`\n❌ Error: ${error.message}`);
        vscode.window.showErrorMessage(`Error: ${error.message}`);
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
 * Extrae el workflow_id del archivo Python abierto
 * @param {string} fileContent - Contenido del archivo
 * @returns {string|null}
 */
function extractWorkflowId(fileContent) {
    // Buscar el patrón workflow_id="..." o workflow_id='...'
    const match = fileContent.match(/workflow_id\s*=\s*["']([a-f0-9-]+)["']/i);
    if (match && match[1]) {
        return match[1];
    }
    return null;
}

function parseJsonFromCommandOutput(output) {
    const trimmed = (output || '').trim();
    if (!trimmed) {
        throw new Error('Salida vacía del comando');
    }

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        return JSON.parse(trimmed);
    }

    const startObj = trimmed.indexOf('{');
    const endObj = trimmed.lastIndexOf('}');
    if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
        return JSON.parse(trimmed.slice(startObj, endObj + 1));
    }

    const startArr = trimmed.indexOf('[');
    const endArr = trimmed.lastIndexOf(']');
    if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
        return JSON.parse(trimmed.slice(startArr, endArr + 1));
    }

    throw new Error('No se encontró JSON válido en la salida');
}

function normalizeExtraParamsWithDefault(extraParamsWithDefault) {
    const normalized = {};

    if (Array.isArray(extraParamsWithDefault)) {
        extraParamsWithDefault.forEach(item => {
            if (item && typeof item === 'object' && item.name) {
                normalized[item.name] = item.value ?? '';
            }
        });
        return normalized;
    }

    if (extraParamsWithDefault && typeof extraParamsWithDefault === 'object') {
        Object.entries(extraParamsWithDefault).forEach(([name, value]) => {
            normalized[name] = value ?? '';
        });
    }

    return normalized;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getCurrentPipelineParamsLists(filePath) {
    try {
        const inputPath = filePath || '';
        const jsonPath = inputPath.endsWith('.json')
            ? inputPath
            : inputPath.endsWith('.py')
                ? inputPath.replace(/\.py$/i, '.json')
                : `${inputPath}.json`;

        if (!fs.existsSync(jsonPath)) {
            return [];
        }

        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const paramsLists = data?.settings?.global?.parametersLists;
        return Array.isArray(paramsLists) ? paramsLists.filter(p => typeof p === 'string') : [];
    } catch {
        return [];
    }
}

function resolvePy2RocketWorkingDir(filePath) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const candidates = [
        path.dirname(filePath || ''),
        workspaceFolder,
        workspaceFolder ? path.join(workspaceFolder, 'py2rocket') : null
    ].filter(Boolean);

    for (const candidate of candidates) {
        const pyprojectPath = path.join(candidate, 'pyproject.toml');
        const packageMainPath = path.join(candidate, 'py2rocket', '__main__.py');
        if (fs.existsSync(pyprojectPath) && fs.existsSync(packageMainPath)) {
            return candidate;
        }
    }

    return path.dirname(filePath || '') || workspaceFolder || process.cwd();
}

function formatExecError(error) {
    const stdout = error && error.stdout ? String(error.stdout) : '';
    const stderr = error && error.stderr ? String(error.stderr) : '';
    const status = typeof error?.status !== 'undefined' ? `Código: ${error.status}` : '';

    const parts = [
        error?.message || 'Error ejecutando comando',
        status,
        stdout ? `\nSTDOUT:\n${stdout}` : '',
        stderr ? `\nSTDERR:\n${stderr}` : ''
    ].filter(Boolean);

    return {
        stdout,
        stderr,
        message: parts.join('\n')
    };
}

function buildExecutionConfigFromRunView(paramData, currentParamsLists = []) {
    const groupsAndContexts = Array.isArray(paramData?.groupsAndContexts) ? paramData.groupsAndContexts : [];
    const currentSet = new Set(currentParamsLists || []);

    const contextGroups = [];
    const fixedParamsLists = [];

    groupsAndContexts.forEach((group, index) => {
        const listName = group?.parameterList?.name || `Lista ${index + 1}`;
        const contexts = Array.isArray(group?.contexts)
            ? group.contexts.map(ctx => ctx?.name).filter(Boolean)
            : [];

        if (contexts.length > 0) {
            const selected = contexts.find(ctx => currentSet.has(ctx)) || contexts[0];
            contextGroups.push({
                listName,
                contexts,
                selected
            });
        } else if (listName) {
            fixedParamsLists.push(listName);
        }
    });

    const extraRequired = Array.isArray(paramData?.extraParams)
        ? paramData.extraParams
            .map(item => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object' && item.name) return item.name;
                return null;
            })
            .filter(Boolean)
        : [];

    const extraDefaults = normalizeExtraParamsWithDefault(paramData?.extraParamsWithDefault);

    return {
        contextGroups,
        fixedParamsLists,
        extraRequired,
        extraDefaults
    };
}

function shellQuote(value) {
    const safe = String(value ?? '').replace(/"/g, '""');
    return `"${safe}"`;
}

async function executeWorkflowFromWebView(data, workflowId, filePath, outputChannel) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No hay una carpeta de trabajo abierta');
        return;
    }

    const pythonCommand = getPythonCommand();
    const commandWorkingDir = resolvePy2RocketWorkingDir(filePath);
    const tempDir = path.join(workspaceFolder, '.py2rocket-tmp');
    fs.mkdirSync(tempDir, { recursive: true });

    const runId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const paramsListsFile = path.join(tempDir, `params_lists_${runId}.json`);
    const extraParamsFile = path.join(tempDir, `extra_params_${runId}.json`);

    try {
        fs.writeFileSync(paramsListsFile, JSON.stringify(data.paramsLists || [], null, 2), 'utf-8');
        fs.writeFileSync(extraParamsFile, JSON.stringify(data.extraParams || [], null, 2), 'utf-8');

        const absoluteInputPath = path.resolve(filePath);
        let runInputPath = absoluteInputPath;

        if (absoluteInputPath.endsWith('.json')) {
            if (!fs.existsSync(absoluteInputPath)) {
                throw new Error(`Archivo no encontrado: ${absoluteInputPath}`);
            }
        } else if (absoluteInputPath.endsWith('.py')) {
            const absoluteJsonPath = absoluteInputPath.replace(/\.py$/i, '.json');
            if (!fs.existsSync(absoluteJsonPath)) {
                outputChannel.appendLine(`[⚙️] No se encontró JSON compilado. Generando: ${path.basename(absoluteJsonPath)}`);
                const buildCommand = `${pythonCommand} -m py2rocket build ${shellQuote(path.basename(absoluteInputPath))}`;
                await executePy2RocketCommand(buildCommand, absoluteInputPath, outputChannel, path.dirname(absoluteInputPath));
            }

            if (!fs.existsSync(absoluteJsonPath)) {
                throw new Error(`No se pudo generar el archivo JSON para ejecutar: ${absoluteJsonPath}`);
            }

            runInputPath = absoluteJsonPath;
        }

        const jsonInputArg = shellQuote(runInputPath);
        const commandParts = [
            `${pythonCommand} -m py2rocket run ${jsonInputArg}`,
            `--workflow-id ${shellQuote(workflowId)}`,
            `--params-lists-file ${shellQuote(paramsListsFile)}`,
            `--extra-params ${shellQuote(extraParamsFile)}`,
            `--instance ${shellQuote(data.instance || 'XS')}`,
            `--execution-priority ${Number(data.executionPriority) || 0}`,
            `--max-attempts ${Number(data.maxAttempts) || 0}`
        ];

        if (data.projectId && String(data.projectId).trim()) {
            commandParts.push(`--project-id ${shellQuote(String(data.projectId).trim())}`);
        }
        if (data.executionName && String(data.executionName).trim()) {
            commandParts.push(`--execution-name ${shellQuote(String(data.executionName).trim())}`);
        }
        if (data.executionDescription && String(data.executionDescription).trim()) {
            commandParts.push(`--execution-description ${shellQuote(String(data.executionDescription).trim())}`);
        }
        if (data.forceExecutionIfAvailableResources) {
            commandParts.push('--force-execution-if-available-resources');
        }
        if (data.retryUnsuccessfulWrites) {
            commandParts.push('--retry-unsuccessful-writes');
        }
        if (data.extendedAuditInfo) {
            commandParts.push('--extended-audit-info');
        }

        const command = commandParts.join(' ');
        await executePy2RocketCommand(command, filePath, outputChannel, commandWorkingDir);
    } finally {
        try { fs.unlinkSync(paramsListsFile); } catch { }
        try { fs.unlinkSync(extraParamsFile); } catch { }
    }
}

/**
 * Crea un WebView con formulario para solicitar ejecución del workflow
 * @param {string} workflowId - ID del workflow
 * @param {vscode.ExtensionContext} context - Contexto de la extensión
 * @param {Object} executionConfig - Configuración de ejecutables disponibles
 */
function createExecutionWebView(workflowId, context, executionConfig = {}) {
    const panel = vscode.window.createWebviewPanel(
        'py2rocketExecution',
        `Ejecutar: ${workflowId.substring(0, 8)}...`,
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    const contextGroups = executionConfig.contextGroups || [];
    const fixedParamsLists = executionConfig.fixedParamsLists || [];
    const extraRequired = executionConfig.extraRequired || [];
    const extraDefaults = executionConfig.extraDefaults || {};
    const projectIdDefault = executionConfig.projectIdDefault || '';

    const contextFieldsHtml = contextGroups.map((group, index) => `
        <div class="form-group">
            <label for="ctx_${index}">${escapeHtml(group.listName)}</label>
            <select id="ctx_${index}" class="context-select" data-list-name="${escapeHtml(group.listName)}" required>
                ${group.contexts.map(ctx => `<option value="${escapeHtml(ctx)}" ${ctx === group.selected ? 'selected' : ''}>${escapeHtml(ctx)}</option>`).join('')}
            </select>
        </div>
    `).join('');

    const fixedFieldsHtml = fixedParamsLists.map(name => `
        <div class="info-item">${escapeHtml(name)}</div>
    `).join('');

    const extraRequiredHtml = extraRequired.map((name, index) => `
        <div class="form-group">
            <label for="extra_required_${index}">${escapeHtml(name)} <span class="required">*</span></label>
            <input type="text" id="extra_required_${index}" class="extra-required" data-name="${escapeHtml(name)}" required />
        </div>
    `).join('');

    const extraDefaultsHtml = Object.entries(extraDefaults).map(([name, value], index) => `
        <div class="form-group">
            <label for="extra_default_${index}">${escapeHtml(name)}</label>
            <input type="text" id="extra_default_${index}" class="extra-default" data-name="${escapeHtml(name)}" value="${escapeHtml(value)}" />
        </div>
    `).join('');

    panel.webview.html = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Solicitar Ejecución</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                }
                
                h2 {
                    color: var(--vscode-editor-foreground);
                    margin-top: 0;
                    border-bottom: 2px solid var(--vscode-panel-border);
                    padding-bottom: 10px;
                }
                
                .section {
                    margin-bottom: 25px;
                    padding: 15px;
                    background-color: var(--vscode-sideBar-background);
                    border-radius: 4px;
                    border-left: 3px solid var(--vscode-focusBorder);
                }

                .step {
                    display: none;
                }

                .step.active {
                    display: block;
                }

                .stepper {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                }

                .step-indicator {
                    flex: 1;
                    padding: 8px 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    font-size: 12px;
                    text-align: center;
                    opacity: 0.7;
                }

                .step-indicator.active {
                    opacity: 1;
                    border-color: var(--vscode-focusBorder);
                    background-color: var(--vscode-inputOption-activeBackground);
                }
                
                .section-title {
                    font-weight: 600;
                    color: var(--vscode-editor-foreground);
                    margin: 0 0 15px 0;
                    font-size: 14px;
                    text-transform: uppercase;
                    opacity: 0.8;
                }
                
                .form-group {
                    margin-bottom: 12px;
                    display: flex;
                    flex-direction: column;
                }
                
                label {
                    margin-bottom: 5px;
                    font-weight: 500;
                    color: var(--vscode-editor-foreground);
                    font-size: 13px;
                }
                
                input[type="text"],
                input[type="number"],
                select {
                    padding: 8px 10px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 3px;
                    font-size: 13px;
                    font-family: inherit;
                }
                
                input[type="text"]:focus,
                input[type="number"]:focus,
                select:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                    box-shadow: 0 0 0 1px var(--vscode-focusBorder);
                }
                
                .button-group {
                    display: flex;
                    gap: 10px;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid var(--vscode-panel-border);
                }
                
                button {
                    flex: 1;
                    padding: 10px 20px;
                    border: none;
                    border-radius: 3px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .btn-submit {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                
                .btn-submit:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .btn-cancel {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                
                .btn-cancel:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
                
                .checkbox-group {
                    display: flex;
                    align-items: center;
                    margin-bottom: 12px;
                }
                
                input[type="checkbox"] {
                    margin-right: 8px;
                    cursor: pointer;
                    width: 16px;
                    height: 16px;
                }
                
                .info-text {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 5px;
                }

                .info-item {
                    padding: 6px 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 3px;
                    margin-bottom: 8px;
                    font-size: 13px;
                }

                .required {
                    color: var(--vscode-errorForeground);
                }

                .error-text {
                    color: var(--vscode-errorForeground);
                    font-size: 12px;
                    margin-top: 8px;
                    min-height: 16px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>▶️ Solicitar Ejecución del Workflow</h2>

                <div class="stepper">
                    <div id="stepIndicator1" class="step-indicator active">1) Parámetros del workflow</div>
                    <div id="stepIndicator2" class="step-indicator">2) Configuración y ejecución</div>
                </div>
                
                <form id="executionForm">
                    <div id="step1" class="step active">
                        <div class="section">
                            <div class="section-title">Contextos requeridos (paramsLists)</div>
                            ${contextFieldsHtml || '<div class="info-text">No hay contextos para seleccionar.</div>'}
                        </div>

                        <div class="section">
                            <div class="section-title">Listas incluidas automáticamente</div>
                            ${fixedFieldsHtml || '<div class="info-text">No hay listas fijas.</div>'}
                        </div>

                        ${extraRequired.length > 0 ? `
                        <div class="section">
                            <div class="section-title">Parámetros extra obligatorios</div>
                            ${extraRequiredHtml}
                        </div>
                        ` : ''}

                        ${Object.keys(extraDefaults).length > 0 ? `
                        <div class="section">
                            <div class="section-title">Parámetros con valor por defecto</div>
                            ${extraDefaultsHtml}
                        </div>
                        ` : ''}

                        <div class="error-text" id="stage1Error"></div>

                        <div class="button-group">
                            <button type="button" class="btn-cancel" onclick="cancelExecution()">Cancelar</button>
                            <button type="button" class="btn-submit" onclick="goToStage2()">Siguiente</button>
                        </div>
                    </div>

                    <div id="step2" class="step">
                        <div class="section">
                            <div class="section-title">Parámetros de ejecución</div>
                            <div class="form-group">
                                <label for="projectId">Project ID (opcional si está en .env)</label>
                                <input type="text" id="projectId" value="${escapeHtml(projectIdDefault)}" />
                            </div>
                            <div class="form-group">
                                <label for="instance">Instance</label>
                                <input type="text" id="instance" value="XS" />
                            </div>
                        </div>

                        <div class="section">
                            <div class="section-title">Execution Settings</div>
                            <div class="form-group">
                                <label for="executionName">Nombre de ejecución</label>
                                <input type="text" id="executionName" />
                            </div>
                            <div class="form-group">
                                <label for="executionDescription">Descripción</label>
                                <input type="text" id="executionDescription" />
                            </div>
                            <div class="form-group">
                                <label for="executionPriority">Execution Priority</label>
                                <input type="number" id="executionPriority" value="0" min="0" />
                            </div>
                            <div class="form-group">
                                <label for="maxAttempts">Max Attempts</label>
                                <input type="number" id="maxAttempts" value="0" min="0" />
                            </div>
                            <div class="checkbox-group">
                                <input type="checkbox" id="forceExecutionIfAvailableResources" />
                                <label for="forceExecutionIfAvailableResources" style="margin-bottom: 0;">Forzar ejecución si hay recursos</label>
                            </div>
                            <div class="checkbox-group">
                                <input type="checkbox" id="retryUnsuccessfulWrites" />
                                <label for="retryUnsuccessfulWrites" style="margin-bottom: 0;">Reintentar escrituras fallidas</label>
                            </div>
                            <div class="checkbox-group">
                                <input type="checkbox" id="extendedAuditInfo" />
                                <label for="extendedAuditInfo" style="margin-bottom: 0;">Auditoría extendida</label>
                            </div>
                        </div>

                        <div class="error-text" id="stage2Error"></div>

                        <div class="button-group">
                            <button type="button" class="btn-cancel" onclick="backToStage1()">Atrás</button>
                            <button type="button" class="btn-submit" onclick="submitExecution()">Ejecutar Workflow</button>
                        </div>
                    </div>
                </form>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                const fixedParamsLists = ${JSON.stringify(fixedParamsLists).replace(/</g, '\\u003c')};
                let stage1Data = null;

                function setStep(stepNumber) {
                    const step1 = document.getElementById('step1');
                    const step2 = document.getElementById('step2');
                    const indicator1 = document.getElementById('stepIndicator1');
                    const indicator2 = document.getElementById('stepIndicator2');

                    if (stepNumber === 1) {
                        step1.classList.add('active');
                        step2.classList.remove('active');
                        indicator1.classList.add('active');
                        indicator2.classList.remove('active');
                    } else {
                        step1.classList.remove('active');
                        step2.classList.add('active');
                        indicator1.classList.remove('active');
                        indicator2.classList.add('active');
                    }
                }

                function collectStage1Data() {
                    const selectedContexts = [];
                    document.querySelectorAll('.context-select').forEach(select => {
                        if (select.value) {
                            selectedContexts.push(select.value);
                        }
                    });

                    const paramsLists = [...fixedParamsLists, ...selectedContexts];

                    const extraParams = [];
                    let hasMissingRequired = false;

                    document.querySelectorAll('.extra-required').forEach(input => {
                        const name = input.getAttribute('data-name');
                        const value = input.value ?? '';
                        if (!value.trim()) {
                            hasMissingRequired = true;
                        }
                        extraParams.push({ name, value });
                    });

                    document.querySelectorAll('.extra-default').forEach(input => {
                        const name = input.getAttribute('data-name');
                        const value = input.value ?? '';
                        extraParams.push({ name, value });
                    });

                    return { paramsLists, extraParams, hasMissingRequired };
                }

                function goToStage2() {
                    const errorEl = document.getElementById('stage1Error');
                    errorEl.textContent = '';

                    const data = collectStage1Data();
                    if (data.hasMissingRequired) {
                        errorEl.textContent = 'Completa todos los parámetros extra obligatorios.';
                        return;
                    }

                    stage1Data = data;
                    setStep(2);
                }

                function backToStage1() {
                    setStep(1);
                }
                
                function submitExecution() {
                    const errorEl = document.getElementById('stage2Error');
                    errorEl.textContent = '';

                    if (!stage1Data) {
                        errorEl.textContent = 'Debes completar primero la etapa 1.';
                        return;
                    }

                    const executionData = {
                        paramsLists: stage1Data.paramsLists,
                        extraParams: stage1Data.extraParams,
                        projectId: document.getElementById('projectId').value,
                        instance: document.getElementById('instance').value || 'XS',
                        executionName: document.getElementById('executionName').value,
                        executionDescription: document.getElementById('executionDescription').value,
                        executionPriority: parseInt(document.getElementById('executionPriority').value) || 0,
                        maxAttempts: parseInt(document.getElementById('maxAttempts').value) || 0,
                        forceExecutionIfAvailableResources: document.getElementById('forceExecutionIfAvailableResources').checked,
                        retryUnsuccessfulWrites: document.getElementById('retryUnsuccessfulWrites').checked,
                        extendedAuditInfo: document.getElementById('extendedAuditInfo').checked
                    };

                    vscode.postMessage({
                        command: 'executeWorkflow',
                        data: executionData
                    });
                }
                
                function cancelExecution() {
                    vscode.postMessage({
                        command: 'cancelExecution'
                    });
                }
            </script>
        </body>
        </html>
    `;

    // Manejar mensajes desde el WebView
    panel.webview.onDidReceiveMessage(
        async message => {
            if (message.command === 'executeWorkflow') {
                try {
                    await executeWorkflowFromWebView(message.data, workflowId, executionConfig.filePath, executionConfig.outputChannel);
                    panel.dispose();
                } catch (error) {
                    vscode.window.showErrorMessage(`Error al ejecutar workflow: ${error.message}`);
                }
            } else if (message.command === 'cancelExecution') {
                panel.dispose();
            }
        },
        undefined
    );
}

/**
 * Crea un WebView con tabla de historial de ejecuciones
 * @param {Object} historyData - Datos del historial
 * @param {vscode.ExtensionContext} context - Contexto de la extensión
 * @param {string} workflowId - ID del workflow
 */
function createHistoryWebView(historyData, context, workflowId) {
    const panel = vscode.window.createWebviewPanel(
        'py2rocketHistory',
        `Historial: ${workflowId.substring(0, 8)}...`,
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    const executions = historyData.executions || [];
    const totalCount = historyData.total_count || 0;

    // Función auxiliar para parsear fecha ISO-8601
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'N/A';
            return date.toLocaleString('es-ES');
        } catch (e) {
            return 'N/A';
        }
    };

    const formatParameterValue = (value) => {
        if (value === null || typeof value === 'undefined') return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    };

    const isVisibleParameter = (key) => {
        return !key.startsWith('SparkConfigurations')
            && !key.startsWith('Environment')
            && !key.startsWith('SparkResources');
    };

    const renderParametersTable = (params) => {
        const entries = Object.entries(params || {}).filter(([key]) => isVisibleParameter(key));
        if (entries.length === 0) {
            return '<span class="no-params">Sin parámetros</span>';
        }

        const rows = entries.map(([key, value]) => {
            const valueStr = escapeHtml(formatParameterValue(value));
            return `
                <tr>
                    <td class="param-name" title="${escapeHtml(key)}">${escapeHtml(key)}</td>
                    <td class="param-value"><pre>${valueStr}</pre></td>
                </tr>
            `;
        }).join('');

        return `
            <div class="params-table-wrapper">
                <table class="params-table">
                    <thead>
                        <tr>
                            <th>Parámetro</th>
                            <th>Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    };

    // Generar filas de tabla
    const tableRows = executions.map(exec => {
        const execId = exec.id || 'N/A';
        const states = exec.statuses || [];
        const latestState = states.length > 0 ? states[0] : {};
        const state = latestState.state || 'Unknown';
        const lastUpdateDate = latestState.lastUpdateDate || 'N/A';

        const assetData = exec.assetDataExecution || {};
        const assetName = assetData.name || 'N/A';
        const params = assetData.parametersUsed || {};
        const paramsTable = renderParametersTable(params);

        return `
            <tr>
                <td class="col-id" title="${execId}">${execId.substring(0, 8)}...</td>
                <td class="col-asset">${assetName}</td>
                <td class="col-state"><span class="state-${state}">${state}</span></td>
                <td class="col-updated">${formatDate(lastUpdateDate)}</td>
                <td class="col-params">${paramsTable}</td>
            </tr>
        `;
    }).join('');

    panel.webview.html = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Historial de Ejecuciones</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 0;
                    padding: 0;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                
                #header {
                    padding: 15px;
                    background-color: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                #header h2 {
                    margin: 0 0 10px 0;
                    color: var(--vscode-editor-foreground);
                }
                
                #searchBox {
                    width: 100%;
                    max-width: 500px;
                    padding: 8px 12px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 4px;
                    font-size: 14px;
                }
                
                #stats {
                    margin-top: 10px;
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                
                #container {
                    padding: 15px;
                    overflow: auto;
                    max-height: calc(100vh - 150px);
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    background-color: var(--vscode-editor-background);
                }

                #historyTable {
                    table-layout: fixed;
                }

                #historyTable th.col-id,
                #historyTable td.col-id {
                    width: 12%;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    overflow: hidden;
                }

                #historyTable th.col-asset,
                #historyTable td.col-asset {
                    width: 20%;
                    overflow-wrap: anywhere;
                }

                #historyTable th.col-state,
                #historyTable td.col-state {
                    width: 10%;
                    white-space: nowrap;
                }

                #historyTable th.col-updated,
                #historyTable td.col-updated {
                    width: 16%;
                    white-space: nowrap;
                }

                #historyTable th.col-params,
                #historyTable td.col-params {
                    width: 42%;
                }
                
                th {
                    background-color: var(--vscode-sideBar-background);
                    padding: 10px;
                    text-align: left;
                    border-bottom: 2px solid var(--vscode-panel-border);
                    font-weight: 600;
                    color: var(--vscode-editor-foreground);
                    position: sticky;
                    top: 0;
                }
                
                td {
                    padding: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    color: var(--vscode-editor-foreground);
                }
                
                tr:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                
                td[title] {
                    cursor: help;
                    text-overflow: ellipsis;
                    overflow: hidden;
                    white-space: nowrap;
                }

                .params-table td[title] {
                    text-overflow: clip;
                    overflow: visible;
                    white-space: normal;
                }

                .params-table-wrapper {
                    max-height: 220px;
                    overflow: auto;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }

                .params-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                    table-layout: fixed;
                }

                .params-table th {
                    position: sticky;
                    top: 0;
                    z-index: 1;
                    font-size: 11px;
                    padding: 6px 8px;
                }

                .params-table td {
                    padding: 6px 8px;
                    vertical-align: top;
                }

                .param-name {
                    width: 35%;
                    font-weight: 600;
                    overflow-wrap: anywhere;
                    word-break: break-word;
                }

                .param-value {
                    width: 65%;
                    min-width: 220px;
                }

                .param-value pre {
                    margin: 0;
                    white-space: pre-wrap;
                    overflow-wrap: anywhere;
                    word-break: break-word;
                    font-family: var(--vscode-editor-font-family);
                }

                .no-params {
                    color: var(--vscode-descriptionForeground);
                }
                
                .state-Completed {
                    background-color: rgba(76, 175, 80, 0.2);
                    color: #4CAF50;
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-weight: 500;
                }
                
                .state-Running {
                    background-color: rgba(33, 150, 243, 0.2);
                    color: #2196F3;
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-weight: 500;
                }
                
                .state-Failed {
                    background-color: rgba(244, 67, 54, 0.2);
                    color: #F44336;
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-weight: 500;
                }
                
                .state-Stopped {
                    background-color: rgba(255, 152, 0, 0.2);
                    color: #FF9800;
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-weight: 500;
                }
                
                .state-Unknown {
                    background-color: rgba(117, 117, 117, 0.2);
                    color: #757575;
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-weight: 500;
                }
                
                .no-results {
                    text-align: center;
                    padding: 30px;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <div id="header">
                <h2>📋 Historial de Ejecuciones</h2>
                <input type="text" id="searchBox" placeholder="Buscar por asset, estado, ID...">
                <div id="stats">
                    <span>Total de ejecuciones: ${totalCount}</span> | 
                    <span>Mostrando: ${executions.length}</span>
                </div>
            </div>
            
            <div id="container">
                <table id="historyTable">
                    <thead>
                        <tr>
                            <th class="col-id">ID Ejecución</th>
                            <th class="col-asset">Asset</th>
                            <th class="col-state">Estado</th>
                            <th class="col-updated">Última Actualización</th>
                            <th class="col-params">Parámetros</th>
                        </tr>
                    </thead>
                    <tbody id="tableBody">
                        ${tableRows || '<tr><td colspan="5" class="no-results">No hay ejecuciones</td></tr>'}
                    </tbody>
                </table>
            </div>
            
            <script>
                const searchBox = document.getElementById('searchBox');
                const tableBody = document.getElementById('tableBody');
                const rows = tableBody.querySelectorAll('tr');
                
                searchBox.addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase();
                    
                    rows.forEach(row => {
                        const text = row.textContent.toLowerCase();
                        row.style.display = text.includes(searchTerm) ? '' : 'none';
                    });
                });
            </script>
        </body>
        </html>
    `;
}

/**
 * Comando: Get History
 * Obtiene el historial de ejecuciones del workflow abierto
 */
async function getHistoryCommand(outputChannel, context) {
    const filePath = getActiveFilePath();
    if (!filePath) return;

    try {
        // Leer contenido del archivo
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const workflowId = extractWorkflowId(fileContent);

        if (!workflowId) {
            vscode.window.showErrorMessage('No se encontró workflow_id en el archivo');
            return;
        }

        outputChannel.show(true);
        outputChannel.appendLine(`\n${'='.repeat(60)}`);
        outputChannel.appendLine(`Obteniendo historial: ${workflowId}`);
        outputChannel.appendLine(`${'='.repeat(60)}\n`);

        const pythonCommand = getPythonCommand();
        const command = `${pythonCommand} -m py2rocket get-history "${workflowId}" -j`;

        // Ejecutar comando sin mostrar mensaje de éxito
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const execOptions = {
            cwd: path.dirname(filePath),
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

        return new Promise((resolve, reject) => {
            const { execSync } = require('child_process');
            try {
                const output = execSync(command, {
                    ...execOptions,
                    encoding: 'utf-8'
                });

                // Parsear JSON
                const trimmed = output.trim();
                let historyData = null;

                if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    historyData = JSON.parse(trimmed);
                } else {
                    const start = trimmed.indexOf('{');
                    const end = trimmed.lastIndexOf('}');
                    if (start !== -1 && end !== -1 && end > start) {
                        const jsonBlock = trimmed.slice(start, end + 1);
                        historyData = JSON.parse(jsonBlock);
                    }
                }

                if (historyData && historyData.status === 'success') {
                    outputChannel.appendLine(`\n✓ Historial obtenido exitosamente`);
                    outputChannel.appendLine(`  Total de ejecuciones: ${historyData.total_count}`);
                    createHistoryWebView(historyData, context, workflowId);
                    resolve();
                } else {
                    throw new Error('Respuesta inválida del comando get-history');
                }
            } catch (error) {
                outputChannel.appendLine(`\n❌ Error: ${error.message}`);
                vscode.window.showErrorMessage(`Error al obtener historial: ${error.message}`);
                reject(error);
            }
        });
    } catch (error) {
        outputChannel.appendLine(`\n❌ Error: ${error.message}`);
        vscode.window.showErrorMessage(`Error: ${error.message}`);
    }
}

/**
 * Comando: Request Execution
 * Abre un formulario para solicitar la ejecución de un workflow
 * Obtiene los parámetros reales del paquete/módulo
 */
async function requestExecutionCommand(outputChannel, context) {
    const filePath = getActiveFilePath();
    if (!filePath) return;

    try {
        // Leer contenido del archivo
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const workflowId = extractWorkflowId(fileContent);

        if (!workflowId) {
            vscode.window.showErrorMessage('No se encontró workflow_id en el archivo');
            return;
        }

        outputChannel.show(true);
        outputChannel.appendLine(`\n${'='.repeat(60)}`);
        outputChannel.appendLine(`Obteniendo parámetros de ejecución: ${workflowId}`);
        outputChannel.appendLine(`${'='.repeat(60)}\n`);

        const pythonCommand = getPythonCommand();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const command = `${pythonCommand} -m py2rocket run-view-parameters "${workflowId}" -j`;
        const commandWorkingDir = resolvePy2RocketWorkingDir(filePath);

        const execOptions = {
            cwd: commandWorkingDir,
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

        return new Promise((resolve, reject) => {
            const { execSync } = require('child_process');
            try {
                const output = execSync(command, {
                    ...execOptions,
                    encoding: 'utf-8'
                });

                const paramData = parseJsonFromCommandOutput(output);
                if (!paramData || paramData.status !== 'success') {
                    throw new Error(paramData?.message || 'Respuesta inválida en run-view-parameters');
                }

                const currentParamsLists = getCurrentPipelineParamsLists(filePath);
                const parsedConfig = buildExecutionConfigFromRunView(paramData, currentParamsLists);
                const executionConfig = {
                    ...parsedConfig,
                    projectIdDefault: process.env.PROJECT_ID || '',
                    filePath,
                    outputChannel
                };

                outputChannel.appendLine('✓ Parámetros obtenidos exitosamente (etapa 1)');
                createExecutionWebView(workflowId, context, executionConfig);
                resolve();
            } catch (error) {
                const formatted = formatExecError(error);
                outputChannel.appendLine(`\n❌ Error obteniendo parámetros de ejecución:\n${formatted.message}`);

                const shortReason = formatted.stderr || formatted.stdout || error.message;
                const shortLine = String(shortReason).split(/\r?\n/).find(line => line.trim()) || error.message;
                vscode.window.showErrorMessage(`No se pudieron obtener los parámetros del workflow: ${shortLine}`);
                reject(error);
            }
        });
    } catch (error) {
        outputChannel.appendLine(`\n❌ Error: ${error.message}`);
        vscode.window.showErrorMessage(`Error: ${error.message}`);
    }
}

/**
 * Comando: Refresh Folder
 * Descarga y actualiza los assets de una carpeta específica seleccionada en el explorador
 * Lee la configuración de .py2rocket de la raíz del workspace
 * @param {vscode.Uri} folderUri - URI de la carpeta seleccionada en el explorador
 */
async function refreshFolderCommand(folderUri, outputChannel) {
    if (!folderUri || !folderUri.fsPath) {
        vscode.window.showErrorMessage('No se especificó una carpeta para actualizar');
        return;
    }

    const selectedFolder = folderUri.fsPath;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No hay una carpeta de trabajo abierta');
        return;
    }

    // Validar que exista archivo .py2rocket en la raíz del workspace
    const py2rocketFile = path.join(workspaceFolder, '.py2rocket');
    if (!fs.existsSync(py2rocketFile)) {
        vscode.window.showErrorMessage('Este workspace no está sincronizado (.py2rocket no encontrado en la raíz)');
        return;
    }

    try {
        const metadataContent = fs.readFileSync(py2rocketFile, 'utf-8');
        const metadata = JSON.parse(metadataContent);
        const syncInfo = metadata.sync_info || {};
        const groupId = (syncInfo.group_id || '').trim();
        const groupName = (syncInfo.group_name || '').trim();

        if (!groupId) {
            vscode.window.showErrorMessage('No se encontró group_id en .py2rocket');
            return;
        }

        // Obtener nombre relativo de la carpeta seleccionada
        const relativePath = path.relative(workspaceFolder, selectedFolder);
        const folderDisplayName = path.basename(selectedFolder);

        const confirm = await vscode.window.showWarningMessage(
            `¿Actualizar carpeta '${folderDisplayName}'?\nSe borrará el contenido y se descargarán los assets.`,
            { modal: true },
            'Actualizar'
        );

        if (confirm !== 'Actualizar') return;

        outputChannel.show(true);
        outputChannel.appendLine(`\n${'='.repeat(60)}`);
        outputChannel.appendLine(`Actualizando carpeta: ${folderDisplayName}`);
        outputChannel.appendLine(`Ruta relativa: ${relativePath}`);
        outputChannel.appendLine(`Ruta completa: ${selectedFolder}`);
        outputChannel.appendLine(`Group ID: ${groupId}`);
        outputChannel.appendLine(`${'='.repeat(60)}\n`);

        // Borra contenido excepto .py2rocket (si existe en esta carpeta)
        const py2rocketInFolder = path.join(selectedFolder, '.py2rocket');
        const excludeFiles = fs.existsSync(py2rocketInFolder) ? ['.py2rocket'] : [];
        const files = fs.readdirSync(selectedFolder);

        let deleteErrors = [];
        for (const file of files) {
            if (excludeFiles.includes(file)) continue;
            const filePath = path.join(selectedFolder, file);
            try {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(filePath);
                }
            } catch (err) {
                deleteErrors.push(`  ⚠️  No se pudo borrar ${file}: ${err.message}`);
            }
        }

        if (deleteErrors.length > 0) {
            outputChannel.appendLine('✓ Contenido borrado (con algunas advertencias)\n');
            deleteErrors.forEach(msg => outputChannel.appendLine(msg));
            outputChannel.appendLine('');
        } else {
            outputChannel.appendLine('✓ Contenido borrado\n');
        }

        // Realiza sync del grupo en la carpeta seleccionada
        // Mapear la carpeta local seleccionada al grupo completo en Rocket
        const relativePathParts = relativePath.split(path.sep).filter(p => p);
        const groupNameParts = splitGroupPath(groupName);

        // Encontrar dónde empieza el subgrupo comparando las últimas partes
        let subgroupParts = [];
        if (groupNameParts.length > 0) {
            const lastGroupPart = groupNameParts[groupNameParts.length - 1];
            const indexOfGroupPart = relativePathParts.indexOf(lastGroupPart);
            if (indexOfGroupPart >= 0) {
                // Las partes después de la carpeta del grupo son el subgrupo
                subgroupParts = relativePathParts.slice(indexOfGroupPart + 1);
            }
        }

        // Construir el grupo completo
        let fullGroupPath = groupName;
        if (subgroupParts.length > 0) {
            fullGroupPath = fullGroupPath + '/' + subgroupParts.join('/');
        }

        const pythonCommand = getPythonCommand();
        const syncCommand = `${pythonCommand} -m py2rocket sync "${fullGroupPath}" --output "."`;

        await executePy2RocketCommand(syncCommand, selectedFolder, outputChannel, selectedFolder);

        // Si py2rocket creó una subcarpeta con el nombre del grupo, mover su contenido hacia arriba
        const lastGroupPart = fullGroupPath.split('/').filter(p => p).pop();
        const createdSubfolder = path.join(selectedFolder, lastGroupPart);
        if (lastGroupPart && fs.existsSync(createdSubfolder) && createdSubfolder !== selectedFolder) {
            try {
                const subfolderFiles = fs.readdirSync(createdSubfolder);
                for (const file of subfolderFiles) {
                    const fromPath = path.join(createdSubfolder, file);
                    const toPath = path.join(selectedFolder, file);
                    fs.renameSync(fromPath, toPath);
                }
                // Eliminar la subcarpeta vacía
                fs.rmdirSync(createdSubfolder);
                outputChannel.appendLine('✓ Estructura de carpetas reorganizada\n');
            } catch (err) {
                outputChannel.appendLine(`⚠️  No se pudo reorganizar carpetas: ${err.message}\n`);
            }
        }

        vscode.window.showInformationMessage(`✓ Carpeta '${folderDisplayName}' actualizada`);
    } catch (error) {
        outputChannel.appendLine(`\n❌ Error: ${error.message}`);
        vscode.window.showErrorMessage(`Error al actualizar: ${error.message}`);
    }
}

/**
 * Comando: Create Group
 * Crea un grupo en Rocket y la carpeta local correspondiente
 */
async function createGroupCommand(folderUri, outputChannel) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No hay una carpeta de trabajo abierta');
        return;
    }

    const syncDetection = detectSyncWorkspace();
    if (!syncDetection.isSynced) {
        vscode.window.showErrorMessage('Este workspace no está sincronizado (.py2rocket)');
        return;
    }

    const syncInfo = syncDetection.metadata?.sync_info || {};
    const baseGroupName = (syncInfo.group_name || '').trim();
    if (!baseGroupName) {
        vscode.window.showErrorMessage('No se encontró group_name en .py2rocket');
        return;
    }

    // Determinar la ruta base desde la que se está creando el grupo
    let selectedFolder = workspaceFolder;
    let relativePath = '';
    if (folderUri && folderUri.fsPath) {
        selectedFolder = folderUri.fsPath;
        relativePath = path.relative(workspaceFolder, selectedFolder);
    }

    const groupInput = await vscode.window.showInputBox({
        prompt: 'Nombre del nuevo grupo ',
        placeHolder: 'nuevo',
        ignoreFocusOut: true
    });

    if (!groupInput) return;

    const inputParts = splitGroupPath(groupInput);
    if (!isSafeGroupParts(inputParts)) {
        vscode.window.showErrorMessage('El nombre del grupo contiene segmentos invalidos');
        return;
    }

    // Construir el nombre completo del grupo basado en la carpeta seleccionada
    const relativePathParts = relativePath.split(path.sep).filter(p => p);
    const groupNameParts = splitGroupPath(baseGroupName);

    let subgroupParts = [];
    if (groupNameParts.length > 0) {
        const lastGroupPart = groupNameParts[groupNameParts.length - 1];
        const indexOfGroupPart = relativePathParts.indexOf(lastGroupPart);
        if (indexOfGroupPart >= 0) {
            subgroupParts = relativePathParts.slice(indexOfGroupPart + 1);
        }
    }

    let fullGroupName = baseGroupName + '/' + inputParts.join('/');
    if (subgroupParts.length > 0) {
        fullGroupName = baseGroupName + '/' + subgroupParts.join('/') + '/' + inputParts.join('/');
    }

    const fullParts = splitGroupPath(fullGroupName);
    if (!isSafeGroupParts(fullParts)) {
        vscode.window.showErrorMessage('El nombre del grupo resultante es invalido');
        return;
    }

    let projectName = (syncInfo.project_name || '').trim();
    if (!projectName) {
        projectName = await vscode.window.showInputBox({
            prompt: 'Nombre del proyecto (PROJECT_NAME)',
            placeHolder: 'MiProyecto',
            ignoreFocusOut: true
        });
        if (!projectName) return;
    }

    const localGroupDir = path.join(selectedFolder, ...inputParts);

    const confirm = await vscode.window.showInformationMessage(
        `Crear grupo '${fullGroupName}' y carpeta local en '${localGroupDir}'?`,
        { modal: true },
        'Crear'
    );

    if (confirm !== 'Crear') return;

    const pythonCommand = getPythonCommand();
    const createCommand = `${pythonCommand} -m py2rocket create-group "${fullGroupName}" --project-name "${projectName}"`;

    try {
        await executePy2RocketCommand(createCommand, path.join(workspaceFolder, '.py2rocket'), outputChannel, workspaceFolder);
        fs.mkdirSync(localGroupDir, { recursive: true });
        vscode.window.showInformationMessage(`✓ Carpeta creada: ${localGroupDir}`);
    } catch (error) {
        console.error('Error en create-group:', error);
    }
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

    // Registrar comando: Pull
    const downloadDisposable = vscode.commands.registerCommand('py2rocket.download', () => {
        downloadCommand(outputChannel);
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

    // Registrar comando: Get History
    const getHistoryDisposable = vscode.commands.registerCommand('py2rocket.getHistory', () => {
        getHistoryCommand(outputChannel, context);
    });

    // Registrar comando: Request Execution
    const requestExecutionDisposable = vscode.commands.registerCommand('py2rocket.requestExecution', () => {
        requestExecutionCommand(outputChannel, context);
    });

    // Registrar comando: Refresh Folder
    const refreshFolderDisposable = vscode.commands.registerCommand('py2rocket.refreshFolder', (folderUri) => {
        refreshFolderCommand(folderUri, outputChannel);
    });

    // Registrar comando: Create Group
    const createGroupDisposable = vscode.commands.registerCommand('py2rocket.createGroup', (folderUri) => {
        createGroupCommand(folderUri, outputChannel);
    });

    context.subscriptions.push(buildDisposable);
    context.subscriptions.push(downloadDisposable);
    context.subscriptions.push(buildAndPushDisposable);
    context.subscriptions.push(pushDisposable);
    context.subscriptions.push(renderDisposable);
    context.subscriptions.push(getHistoryDisposable);
    context.subscriptions.push(requestExecutionDisposable);
    context.subscriptions.push(refreshFolderDisposable);
    context.subscriptions.push(createGroupDisposable);
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
