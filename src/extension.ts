import { FileSystemWatcher, Uri, commands, workspace, RelativePattern, ExtensionContext } from 'vscode';

import path from 'node:path';
import { existsSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { rename, mkdir } from 'node:fs/promises';

import { pathLogic, pathLogic2 } from './utils';

const excludePattern = [
	'**/node_modules/**',
	'**/lib/**',
	'**/out/**',
	'**/.git/**',
	'**/openzeppelin-contracts-upgradeable/**',
	'**/openzeppelin-contracts/**',
	'**/cache_forge/**',
];

const cwd = workspace.workspaceFolders![0].uri.path.slice(1);
// console.log(cwd);
let skipImports = workspace.getConfiguration('sol-paths-helper').get('skipImports');

appendFileSync('./1.txt', `${cwd}\n`);

const skipRegexp = new RegExp(`^import\\s*(?:{[^{}]*})?\\s*(?:from\\s*)?["'](${skipImports})[^"']*\\.sol["'];`);

const watcher = workspace.createFileSystemWatcher(new RelativePattern(cwd, '**/*.sol'));

const watcherLogic = async (e: Uri) => {
	const filesToWatch = await workspace.findFiles('**/*.sol', `{${excludePattern.join(',')}}`);

	const regexSubtract = new RegExp(`^${cwd}(\/)?`);
	const regexp = new RegExp(/^import\s+.*".*?\.sol";/);

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
						console.log('SKIPPED', line);

						continue;
					}
					console.log('NOT SKIPPED', line);

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
						if (line.split('"')[0].includes('{')) {
							const match = line.split('"')[0].match(/\{([^}]+)\}/);

							theBracesImport = match! && match[0]! + ' from ';
						}

						const depName = path.basename(line.split('"')[1]);

						if (depName === fileName) {
							const otherFilePath = file.path.slice(1).replace(regexSubtract, '');
							const movedFilePath = e.path.slice(1).replace(regexSubtract, '');

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
				if (line.split('"')[0].includes('{')) {
					const match = line.split('"')[0].match(/\{([^}]+)\}/);

					theBracesImport = match! && match[0]! + ' from ';
				}
				const depName = path.basename(line.split('"')[1]);

				if (movedFileName === depName) {
					const pathOfAFileToEdit = file.path.slice(1).replace(regexSubtract, '');
					const newPath = e.path.slice(1).replace(regexSubtract, '');

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

	// allFiles = [];
};

const globalEdit = async () => {
	const excludePattern = [
		'**/node_modules/**',
		'**/lib/**',
		'**/out/**',
		'**/.git/**',
		'**/openzeppelin-contracts-upgradeable/**',
		'**/openzeppelin-contracts/**',
	];
	const allFiles = await workspace.findFiles('**/*.sol', `{${excludePattern.join(',')}}`);
	console.log('Finished moving, starting editing paths');

	const regexSubtract = new RegExp(`^${cwd}(\/)?`);
	const regexp = new RegExp(/^import\s+.*".*?\.sol";/);

	for await (let file of allFiles) {
		let newLines = [];
		const fileContent = readFileSync(file.fsPath, 'utf8');

		const lines = fileContent.split('\n');

		for await (let line of lines) {
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
					if (line.split('"')[0].includes('{')) {
						const match = line.split('"')[0].match(/\{([^}]+)\}/);

						theBracesImport = match! && match[0]! + ' from ';
					}

					const depName = path.basename(line.split('"')[1]);

					if (depName === path.basename(innerFile.path)) {
						// TYT ERROR!!!!!!!!
						const currentFilePath = file.path.slice(1).replace(regexSubtract, '');
						const otherFilePath = innerFile.path.slice(1).replace(regexSubtract, '');
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
	const combinedRegex = new RegExp(`${cwd}/(lib|out|node_modules|.git|cache_forge)`);

	watcher.onDidCreate(async (e) => {
		// skip unneded files
		console.log('REGEXP', combinedRegex);
		console.log('CREATED', e.fsPath);
		appendFileSync('./1.txt', `JSON!!!!, ${JSON.stringify(e.fsPath)}\n`);

		if (
			(path.basename(e.fsPath).includes('.sol') && !combinedRegex.test(e.fsPath)) ||
			!/\\d:\\Coding\\2023-11-kelp\\out\\/.test(e.fsPath) ||
			!/\\d:\\Coding\\2023-11-kelp\\lib\\/.test(e.fsPath)
		) {
			appendFileSync('./1.txt', `MATCHES, ${e.fsPath}\n`);
			console.log('MATCHES', JSON.stringify(e.fsPath));
			// channel.sendText(`MATCHES ${e.path.slice(1)}`);

			await watcherLogic(e);
		}
	});
};

export function activate(context: ExtensionContext) {
	let disposable = commands.registerCommand('sol-paths-helper', async () => {
		// console.log(skipImports);

		let foundryBaseFolder: string = '';

		// const skipRegexp = new RegExp(`^import\s*{?[^"}]*}?\s*(?:from\s*)?"\s*(${skipImports})[^"]*"\s*;`);

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
			const scopeFiles = await workspace.findFiles('**/scope.*', `{${excludePattern.join(',')}}`);
			const foundryConfig = await workspace.findFiles('**/foundry.toml', `{${excludePattern.join(',')}}`);

			const hardhatConfig = await workspace.findFiles('**/hardhat.config.{js,ts}', `{${excludePattern.join(',')}}`);
			// console.log(hardhatConfig);

			// console.log('CONFIG');

			// console.log(foundryConfig);

			if (scopeFiles.length > 1) {
				throw Error('More than 2 scope files');
			} else if (scopeFiles.length === 0) {
				throw Error('No scope file');
			}

			if (foundryConfig.length > 1 || !foundryConfig.length) {
				{
					if (!hardhatConfig.length) {
						throw Error('No configs found');
					} else if (!foundryConfig.length && hardhatConfig.length === 1) {
						const tempString = hardhatConfig[0].path.slice(1).split('/');

						foundryBaseFolder = tempString.join('/');
					}
				}
			} else if (foundryConfig.length === 1) {
				const tempString = foundryConfig[0].path.slice(1).split('/');
				tempString.pop();
				foundryBaseFolder = tempString.join('/');
			}

			if (existsSync(foundryBaseFolder + '/src/scope/')) {
				throw Error('Scope folder already exists, skipping to watcher');
			}

			// const thePath = workspace.workspaceFolders![0].uri.path.slice(1);
			// // show info message
			// await window.showWarningMessage(`Working... ${allFiles.length} files to move`);
			console.log(foundryBaseFolder);

			if (!existsSync(foundryBaseFolder + '/src/scope/')) {
				await mkdir(foundryBaseFolder + '/src/scope/', { recursive: true });
			}

			const scopeFileContent = readFileSync(scopeFiles[0].fsPath, 'utf8');
			const lines = scopeFileContent.split('\n');

			for await (let line of lines) {
				if (line.replace('\r', '').length === 0) {
					continue;
				}
				const scopeFileName = path.basename(line.replace('\r', ''));

				let oldPath = line.toString()[0] === '/' ? cwd + line.replace('\r', '') : cwd + '/' + line.replace('\r', '');
				const newPath = foundryBaseFolder + '/src/scope/' + scopeFileName;

				await new Promise(async (resolve) => {
					let success = false;
					while (!success) {
						try {
							await rename(oldPath, newPath);
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

			// START GLOBAL PATH EDITING
			await globalEdit();

			runTheWatcher(watcher);
		} catch (error) {
			// if error with foundry config paths etc - just watch files
			console.error(error);
			runTheWatcher(watcher);
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
