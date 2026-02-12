const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Ejecuta un comando de py2rocket
 * @param {string} command - El comando a ejecutar
 * @param {string} filePath - Ruta del archivo activo
 * @param {vscode.OutputChannel} outputChannel - Canal de salida
 * @returns {Promise<void>}
 */
function executePy2RocketCommand(command, filePath, outputChannel) {
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

        // Ejecutar el comando en el directorio del workspace
        exec(command, { cwd: workspaceFolder }, (error, stdout, stderr) => {
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
    const command = `py2rocket build "${fileName}"`;

    try {
        await executePy2RocketCommand(command, filePath, outputChannel);

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

    try {
        // Paso 1: Build
        outputChannel.appendLine('Paso 1/2: Building...');
        const buildCommand = `py2rocket build "${fileName}"`;
        await executePy2RocketCommand(buildCommand, filePath, outputChannel);

        // Paso 2: Push
        outputChannel.appendLine('\nPaso 2/2: Pushing to Rocket...');
        const pushCommand = `py2rocket push "${jsonFileName}"`;
        await executePy2RocketCommand(pushCommand, filePath, outputChannel);

        vscode.window.showInformationMessage(`✓ Build and Push completado: ${fileNameWithoutExt}`);
    } catch (error) {
        console.error('Error en build and push:', error);
    }
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

    context.subscriptions.push(buildDisposable);
    context.subscriptions.push(buildAndPushDisposable);
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
