import { FileSystemWatcher, Uri, commands, workspace, RelativePattern, ExtensionContext, window } from 'vscode';

import path from 'node:path';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { rename, mkdir } from 'node:fs/promises';
import { generateSlocReport, getFolders, osPathFixer, pathLogic, pathLogic2 } from './utils';

const excludePattern = [
	'**/node_modules/**',
	'**/lib/**',
	'**/out/**',
	'**/.git/**',
	'**/openzeppelin-contracts-upgradeable/**',
	'**/openzeppelin-contracts/**',
	'**/artifacts/**',
	'**/coverage/**',
	'**/cache_forge/**',
	'**/cache/**',
	'**/.github/**',
	'**/.vscode/**',
	'**/.yarn/**',
	'**/hh-cache/**',
];

const cwd = osPathFixer(workspace.workspaceFolders![0].uri.path);

/// REGEXP VARS
///
const foldersToSkip = ['lib', 'out', 'node_modules', '.git', 'cache_forge', 'cache'];

const skipImports = ['hardhat', 'lib', 'halmos', 'forge', 'openzeppelin', 'forge-std', 'solady', 'solmate'];

if (existsSync(`${cwd}/lib`)) {
	skipImports.push(...getFolders(`${cwd}/lib`));
}

const skipRegexp = new RegExp(`^import\\s(?:{.*}\\sfrom\\s)?["'](\b(@?)${skipImports.join('|')}\b).*\\.sol["'];`, 'i');

const callRegexp = new RegExp(/.*\.(call|delegatecall)({.*})?\(/i);
const balanceCheckRegexp = new RegExp(/(?=.*(>|<|>=|<=|==))(?=.*balance).*/i);
const uncheckedReturnRegexp = new RegExp(/(\s)?\(bool\s.*\=/i);
const alreadyBookmarkedLine = new RegExp(/\/\/\s@audit(-info|-issue|-ok)?/i);
///
///
let shouldBeSkipped = false;

const watcher = workspace.createFileSystemWatcher(new RelativePattern(cwd, '**/*.sol'));
const watcherLogic = async (e: Uri) => {
	const filesToWatch = await workspace.findFiles('**/*.sol', `{${excludePattern.join(',')}}`);

	const regexSubtract = new RegExp(`^${cwd}(\/)?`);
	const regexp = new RegExp(/^import\s(?:{.*}\sfrom\s)?["'].*\.sol["'];/i);

	for await (let file of filesToWatch) {
		// filter out the newly moved file

		const fileName = path.basename(file.path);
		const movedFileName = path.basename(e.path);

		// LOGIC FOR THE MOVED FILE
		if (fileName === movedFileName) {
			const movedFileContent = readFileSync(e.fsPath, 'utf8');
			// iterate lines
			let newLines = [];
			const lines = movedFileContent.split('\n');

			for await (let line of lines) {
				if (regexp.test(line)) {
					if (skipRegexp.test(line)) {
						newLines.push(line);
						// console.log('SKIPPED', line);

						continue;
					}
					// console.log('NOT SKIPPED', line);

					for await (let file of filesToWatch) {
						// filter out the newly moved file
						const fileName = path.basename(file.path);
						const movedFileName = path.basename(e.path);
						if (fileName === movedFileName) {
							continue;
						}

						//
						//checking for {} import
						let theBracesImport = '';
						if (line.split(/["']/)[0].includes('{')) {
							const match = line.split(/["']/)[0].match(/\{([^}]+)\}/);

							theBracesImport = match! && match[0]! + ' from ';
						}

						const depName = path.basename(line.split(/["']/)[1]);
						// const depName = line.match(/(?<=\/)[A-Za-z_]+\.sol/)![0];

						if (depName === fileName) {
							const otherFilePath = osPathFixer(file.path).replace(regexSubtract, '');
							const movedFilePath = osPathFixer(e.path).replace(regexSubtract, '');

							line = pathLogic(otherFilePath, movedFilePath, depName, line, theBracesImport);
						}
					}
				}
				newLines.push(line);
			}
			const updatedData = newLines.join('\n');

			try {
				writeFileSync(file.fsPath, updatedData, 'utf8');
				newLines = [];
				continue;
			} catch (error) {
				console.log('WRITING ERROR', error);
			}
		}

		const aFileContent = readFileSync(file.fsPath, 'utf8');
		// iterate lines
		const lines = aFileContent.split('\n');
		let newLines = [];
		for await (let line of lines) {
			if (regexp.test(line)) {
				if (skipRegexp.test(line)) {
					newLines.push(line);
					continue;
				}
				//checking for {} import
				let theBracesImport = '';
				if (line.split(/["']/)[0].includes('{')) {
					const match = line.split(/["']/)[0].match(/\{([^}]+)\}/);

					theBracesImport = match! && match[0]! + ' from ';
				}
				const depName = path.basename(line.split(/["']/)[1]);
				// console.log('FILE', file.fsPath);

				// const depName = line.match(/(?<=\/)[A-Za-z_]+\.sol/)![0];
				// console.log('depName', depName);

				if (movedFileName === depName) {
					const pathOfAFileToEdit = osPathFixer(file.path).replace(regexSubtract, '');
					const newPath = osPathFixer(e.path).replace(regexSubtract, '');

					line = pathLogic2(pathOfAFileToEdit, newPath, depName, line, theBracesImport);
				}
			}
			newLines.push(line);
		}
		const updatedData = newLines.join('\n');

		try {
			writeFileSync(file.fsPath, updatedData, 'utf8');
			newLines = [];
		} catch (error) {
			console.log('WRITING ERROR', error);
		}
	}
};

const globalEdit = async (parseFilesForPotentialVulnerabilities: boolean) => {
	const excludePattern = ['**/node_modules/**', '**/lib/**', '**/out/**', '**/.git/**'];
	const allFiles = await workspace.findFiles('**/*.sol', `{${excludePattern.join(',')}}`);

	const regexSubtract = new RegExp(`^${cwd}(\/)?`);
	const regexp = new RegExp(/^import\s+.*".*?\.sol";/);

	for await (let file of allFiles) {
		const fileContent = readFileSync(file.fsPath, 'utf8');

		const lines = fileContent.split('\n');
		let newLines = [];
		for await (let line of lines) {
			if (parseFilesForPotentialVulnerabilities && file.path.split('/').slice(-2, -1)[0] === 'scope') {
				if (shouldBeSkipped) {
					newLines.push(line);
					shouldBeSkipped = false;
					continue;
				} else if (alreadyBookmarkedLine.test(line)) {
					shouldBeSkipped = true;
					newLines.push(line);
					continue;
				} else if (callRegexp.test(line)) {
					const origLine = line;
					line = '// @audit-info CALL\n' + origLine;
					if (!uncheckedReturnRegexp.test(origLine)) {
						line = '// @audit-issue unchecked return\n' + origLine;
					}
					newLines.push(line);
					continue;
				} else if (balanceCheckRegexp.test(line)) {
					// const origLine = line;
					line = '// @audit-info BALANCE CHECK\n' + line;
					newLines.push(line);
					continue;
				}
			}
			// if file has imports
			if (regexp.test(line)) {
				// skip lib imports
				if (skipRegexp.test(line)) {
					newLines.push(line);
					continue;
				}
				// if line is a good import
				// iterating through all the files
				for await (let innerFile of allFiles) {
					// if the files are the same - skip
					if (file.path === innerFile.path) {
						continue;
					}
					//
					//checking for {} import
					let theBracesImport = '';
					if (line.split(/["']/)[0].includes('{')) {
						const match = line.split(/["']/)[0].match(/\{([^}]+)\}/);

						theBracesImport = match! && match[0]! + ' from ';
					}

					const depName = path.basename(line.split(/["']/)[1]);
					// const depName = line.match(/(?<=\/)[A-Za-z_]+\.sol/)![0];

					if (depName === path.basename(innerFile.path)) {
						const currentFilePath = osPathFixer(file.path).replace(regexSubtract, '');
						const otherFilePath = osPathFixer(innerFile.path).replace(regexSubtract, '');
						// console.log('CURRENT FILE PATH', currentFilePath);
						// console.log('OTHER FILE PATH', otherFilePath);

						line = pathLogic2(currentFilePath, otherFilePath, depName, line, theBracesImport);
					}
				}
			}
			newLines.push(line);
		}
		const updatedData = newLines.join('\n');
		try {
			writeFileSync(file.fsPath, updatedData, 'utf8');
			newLines = [];
		} catch (error) {
			console.log('WRITING ERROR', error);
		}
	}
};

const runTheWatcher = (watcher: FileSystemWatcher) => {
	const winCwd = cwd.replaceAll('/', '\\\\');

	const combinedRegex =
		process.platform === 'win32'
			? new RegExp(`${winCwd}\\\\(${foldersToSkip.join('|')}).*`, 'i')
			: new RegExp(`${cwd}/(${foldersToSkip.join('|')}).*`, 'i');

	watcher.onDidCreate(async (e) => {
		if (path.basename(e.fsPath).includes('.sol') && !combinedRegex.test(e.fsPath)) {
			await watcherLogic(e);
		}
	});
};

export function activate(context: ExtensionContext) {
	let disposable = commands.registerCommand('sol-audit-helpers', async () => {
		const extSettings = workspace.getConfiguration('sol-audit-helper');

		let foundryBaseFolder: string = '';

		try {
			// search for scope files
			const excludePattern = [
				'**/node_modules/**',
				'**/lib/**',
				'**/out/**',
				'**/.git/**',
				'**/openzeppelin-contracts-upgradeable/**',
				'**/openzeppelin-contracts/**',
			];
			const foundryConfigs = await workspace.findFiles('**/foundry.toml', `{${excludePattern.join(',')}}`);

			const hardhatConfig = await workspace.findFiles('**/hardhat.config.{js,ts}', `{${excludePattern.join(',')}}`);

			let neededPath = '';

			// console.log(foundryConfigs.length);
			// console.log(foundryConfigs);

			if (foundryConfigs.length > 1 || !foundryConfigs.length) {
				{
					if (!hardhatConfig.length) {
						throw Error('No configs found');
					} else if (!foundryConfigs.length && hardhatConfig.length === 1) {
						const tempString = osPathFixer(hardhatConfig[0].path).split('/');

						foundryBaseFolder = tempString.join('/');
					}
				}
			} else if (foundryConfigs.length === 1) {
				const tempString = process.platform === 'win32' ? osPathFixer(foundryConfigs[0].path).split('/') : foundryConfigs[0].path.split('/');
				tempString.pop();
				foundryBaseFolder = tempString.join('/');

				// reading config file to get the src path
				const foundryConfigContent = readFileSync(foundryConfigs[0].fsPath, 'utf8');

				const srcRegexp = new RegExp(/^src(\s)?=(\s)?["']/i);
				const matchRegexp = new RegExp(/'(.*)'|"(.*)"/g);
				const redFlagRegexp = new RegExp(/\bffi\b\s*\=\s*\btrue\b/);
				const configLines = foundryConfigContent.split('\n');
				for await (let line of configLines) {
					// console.log(line);

					if (line.replace('\r', '').length === 0 || (!srcRegexp.test(line) && !redFlagRegexp.test(line))) {
						continue;
					} else if (redFlagRegexp.test(line)) {
						throw Error('SCAM ALERT!!! FFI is enabled, aborting...');
					} else {
						neededPath = line.match(matchRegexp)![0].slice(1, -1);

						console.log('NEEDED PATH', neededPath);
					}
				}
			}

			if (existsSync(neededPath.length ? foundryBaseFolder + `/${neededPath}/scope/` : foundryBaseFolder + '/src/scope/')) {
				throw Error('Scope folder already exists, skipping to watcher');
			}

			const newPath = neededPath.length ? foundryBaseFolder + `/${neededPath}/scope/` : foundryBaseFolder + '/src/scope/';
			const scopeFiles = await workspace.findFiles('**/scope.*', `{${excludePattern.join(',')}}`);

			if (scopeFiles.length > 1) {
				throw Error('More than 2 scope files');
			} else if (scopeFiles.length === 0) {
				throw Error('No scope file');
			}

			//
			if (!existsSync(neededPath.length ? foundryBaseFolder + `/${neededPath}/scope/` : foundryBaseFolder + '/src/scope/')) {
				await mkdir(neededPath.length ? foundryBaseFolder + `/${neededPath}/scope/` : foundryBaseFolder + '/src/scope/', { recursive: true });
			}

			const scopeFileContent = readFileSync(scopeFiles[0].fsPath, 'utf8');
			const lines = scopeFileContent.split('\n');
			const scopeNames = [];
			for await (let line of lines) {
				if (line.replace('\r', '').length === 0) {
					continue;
				}
				const scopeFileName = path.basename(line.replace('\r', ''));
				// push scope name for inheritance graph
				scopeNames.push(scopeFileName);

				let oldPath = line.toString()[0] === '/' ? cwd + line.replace('\r', '') : cwd + '/' + line.replace('\r', '');

				await new Promise(async (resolve) => {
					let success = false;
					while (!success) {
						try {
							await rename(oldPath, newPath + scopeFileName);
							success = true;
						} catch (error: any) {
							if (error.message.includes('ENOENT')) {
								console.log('Wrong path, searching for the file');

								const missingFiles = await workspace.findFiles(`**/${scopeFileName}`, `{${excludePattern.join(',')}}`);

								if (missingFiles.length === 0) {
									throw Error('File from the scope not found, aborting...');
								} else if (missingFiles.length > 1) {
									throw Error('Duplicate from the scope found, aborting...');
								}
								oldPath = missingFiles[0].fsPath;
							} else {
								// if error is about file busy or sth
								console.log(error);
								await new Promise((r) => setTimeout(r, 1000));
							}
						}
					}

					resolve(true);
				});
			}

			if (extSettings.get('slocReportFile')) {
				await generateSlocReport(cwd, scopeNames, newPath);
			}

			// START GLOBAL PATH EDITING
			await globalEdit(extSettings.get('parseFilesForPotentialVulnerabilities')!);
			// and run the watcher
			runTheWatcher(watcher);
		} catch (error: any) {
			console.error(error);
			if (error.message === 'SCAM ALERT!!! FFI is enabled, aborting...') {
				await window.showInformationMessage(
					'SCAM ALERT!!! FFI is enabled, aborting... Do not run any scripts, just carefully delete the repo from your device.'
				);
				return;
			} else if (error.message === 'Scope folder already exists, skipping to watcher') {
				await window.showInformationMessage('Scope folder already exists, skipping to watcher');
				runTheWatcher(watcher);
			} else if (error.message === 'No scope file') {
				await window.showInformationMessage('No scope file, aborting... Please generate the scope file, reload the window and rerun the extension');
				return;
			} else if (error.message === 'More than 2 scope files') {
				await window.showInformationMessage('More than 2 scope files, aborting... ');
				return;
			} else if (error.message === 'No configs found') {
				await window.showInformationMessage('No configs found, aborting... ');
				return;
			} else if (error.message === 'Duplicate file from the scope list found, aborting...') {
				await window.showInformationMessage('Duplicate from the scope found, aborting...');
				return;
			} else if (error.message === 'File from the scope not found, aborting...') {
				await window.showInformationMessage('File from the scope not found, aborting...');
				return;
			} else {
				// if error with foundry config paths etc - just watch files
				runTheWatcher(watcher);
			}
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
