import { FileSystemWatcher, Uri, commands, workspace, RelativePattern, ExtensionContext } from 'vscode';

import path from 'node:path';
import { existsSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { rename, mkdir } from 'node:fs/promises';

import { getFolders, osPathFixer, pathLogic, pathLogic2, htmlTemplate, cssTemplate } from './utils';

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
skipImports.push(...getFolders(`${cwd}/lib`));

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
						if (line.split('"')[0].includes('{')) {
							const match = line.split('"')[0].match(/\{([^}]+)\}/);

							theBracesImport = match! && match[0]! + ' from ';
						}

						const depName = path.basename(line.split('"')[1]);

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
				if (line.split('"')[0].includes('{')) {
					const match = line.split('"')[0].match(/\{([^}]+)\}/);

					theBracesImport = match! && match[0]! + ' from ';
				}
				const depName = path.basename(line.split('"')[1]);

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

const globalEdit = async (scopeNames: string[]) => {
	const excludePattern = [
		'**/node_modules/**',
		'**/lib/**',
		'**/out/**',
		'**/.git/**',
		'**/openzeppelin-contracts-upgradeable/**',
		'**/openzeppelin-contracts/**',
	];
	const allFiles = await workspace.findFiles('**/*.sol', `{${excludePattern.join(',')}}`);

	const regexSubtract = new RegExp(`^${cwd}(\/)?`);
	const regexp = new RegExp(/^import\s+.*".*?\.sol";/);

	const functionExtractorRegexp = new RegExp(/(^|s+)?\bfunction\b\s.*\(.*\).*\{[^}]*}/g);
	const contractInheritanceRegexp = new RegExp(/(?<=^contract .* is )[\w*(?:\,\s)]+(?={)/gm);
	writeFileSync(`${cwd}/styles.css`, cssTemplate);
	writeFileSync(`${cwd}/graph.html`, htmlTemplate);

	for await (let file of allFiles) {
		const fileContent = readFileSync(file.fsPath, 'utf8');
		const fileName = path.basename(file.fsPath);

		//if the file is in the scope
		if (scopeNames.includes(fileName)) {
			// check imports
			const importRegexp = new RegExp(/(?<=^\bimport\b\s)(?:\{\s?)?[\w(?:\,\s?)]+(?:\s?})/gm);

			const importNames = fileContent.matchAll(importRegexp);
			let importList = [];
			for await (let importName of importNames) {
				const strippedImports = importName[0].match(/\w*/gi);
				// const strippedImports = importName[0].match(/(?<=.* )\w+/i);
				if (strippedImports) {
					for await (let strippedImportName of strippedImports) {
						// console.log(strippedImportName);
						importList.push(strippedImportName);
					}
				}
			}

			// check contract inheritrance
			const contractInheritance = fileContent.matchAll(contractInheritanceRegexp);
			const inheritanceLength = Array.from(contractInheritance).length;
			let inheritancesArray: string[] = [];
			if (inheritanceLength) {
				const inheritances = fileContent.matchAll(contractInheritanceRegexp);
				inheritancesArray = Array.from(inheritances)[0].toString().split(', ');
			}

			const allFuncs = fileContent.matchAll(functionExtractorRegexp);
			const funcsLength = Array.from(allFuncs).length;

			if (importList.length || inheritancesArray.length || funcsLength) {
				appendFileSync(`${cwd}/graph.html`, `<div class='fullFile'>`);

				if (funcsLength) {
					// add header to graph if a file has functions
					appendFileSync(`${cwd}/graph.html`, `<div class='fileName'><h3>${fileName}<h3></div>`);
				}

				if (inheritancesArray.length) {
					// for await (let inheritance of inheritancesArray) {
					// 	for await (let file2 of allFiles) {
					// 		const file2Name = path.basename(file2.fsPath).split('.')[0];
					// 		if (file2Name === inheritance.trim()) {
					// 			const fileContent2 = readFileSync(file2.fsPath, 'utf8');
					// 			const allFuncs = fileContent2.matchAll(functionExtractorRegexp);
					// 			const funcsLength = Array.from(allFuncs).length;
					// 			if (funcsLength) {
					// 				appendFileSync(
					// 					`${cwd}/graph.html`,
					// 					`<div class='contract-inheritance'><h4>Inherits from ${file2Name}</h4><div class='contract-inheritance__funcs'>`
					// 				);
					// 				for await (let func of fileContent2.matchAll(functionExtractorRegexp)) {
					// 					// console.log(func + '\n');
					// 					const lines = func.toString().split('\n');
					// 					const firstLine = lines[0];
					// 					const funcName = firstLine.match(/(\w+)(?=\()/)![0];
					// 					if (fileContent.includes(funcName + '(')) {
					// 						//MARK THE INHERITANCE
					// 						appendFileSync(`${cwd}/graph.html`, `<div class='func'>${funcName}</div>`);
					// 					}
					// 				}
					// 				appendFileSync(`${cwd}/graph.html`, `</div></div>`);
					// 			}
					// 		}
					// 	}
					// }
				}

				appendFileSync(`${cwd}/graph.html`, `<div class='functions'>`);
				// now we need to find functions
				for await (let func of fileContent.matchAll(functionExtractorRegexp)) {
					// console.log(func + '\n');
					const lines = func.toString().split('\n');
					const firstLine = lines[0];

					const funcName = firstLine.match(/(\w+)(?=\()/)![0];
					appendFileSync(`${cwd}/graph.html`, `<div class='fullFunc'>`);

					if (firstLine.includes('payable')) {
						appendFileSync(`${cwd}/graph.html`, `<div class='func payable'>${funcName}</div>`);
					} else if (firstLine.includes('pure')) {
						appendFileSync(`${cwd}/graph.html`, `<div class='func pure'>${funcName}</div>`);
					} else if (firstLine.includes('external') || firstLine.includes('public')) {
						appendFileSync(`${cwd}/graph.html`, `<div class='func external'>${funcName}</div>`);
					} else {
						appendFileSync(`${cwd}/graph.html`, `<div class='func'>${funcName}</div>`);
					}

					//search for imports
					const funcContentRegexp = new RegExp(/\{[^}]*}/g);
					const funcContent = func.toString().match(funcContentRegexp)![0];
					appendFileSync(`${cwd}/graph.html`, `<div class='inheritance'>`);

					for await (let importName of importList) {
						// console.log(importName);
						if (funcContent.includes(importName)) {
							appendFileSync(`${cwd}/graph.html`, `<div>${importName}</div>`);
						}
					}
					for await (let inheritance of inheritancesArray) {
						for await (let file2 of allFiles) {
							const file2Name = path.basename(file2.fsPath).split('.')[0];

							if (file2Name === inheritance.trim()) {
								const fileContent2 = readFileSync(file2.fsPath, 'utf8');
								const allFuncs = fileContent2.matchAll(functionExtractorRegexp);
								const funcsLength = Array.from(allFuncs).length;
								if (funcsLength) {
									for await (let func of fileContent2.matchAll(functionExtractorRegexp)) {
										// console.log(func + '\n');
										const lines = func.toString().split('\n');
										const firstLine = lines[0];

										const funcName = firstLine.match(/(\w+)(?=\()/)![0];
										// BE CAREFULL HERE
										// THE NEXT LINE IS FUNCCONTENT NOT THE FILECONTENT!!!
										if (funcContent.includes(funcName + '(')) {
											//MARK THE INHERITANCE
											if (firstLine.includes('payable')) {
												appendFileSync(`${cwd}/graph.html`, `<div class='inh-text'>From ${file2Name}`);
												appendFileSync(`${cwd}/graph.html`, `<div class='func payable'>${funcName}</div>`);
											} else if (firstLine.includes('pure')) {
												appendFileSync(`${cwd}/graph.html`, `<div class='inh-text'>From ${file2Name}`);
												appendFileSync(`${cwd}/graph.html`, `<div class='func pure'>${funcName}</div>`);
											} else if (firstLine.includes('external') || firstLine.includes('public')) {
												appendFileSync(`${cwd}/graph.html`, `<div class='inh-text'>From ${file2Name}`);
												appendFileSync(`${cwd}/graph.html`, `<div class='func external'>${funcName}</div>`);
											} else {
												appendFileSync(`${cwd}/graph.html`, `<div class='inh-text'>From ${file2Name}`);
												appendFileSync(`${cwd}/graph.html`, `<div class='func'>${funcName}</div>`);
											}
										}
									}
								}
								appendFileSync(`${cwd}/graph.html`, `</div>`);
							}
						}
					}

					appendFileSync(`${cwd}/graph.html`, `</div>`);

					appendFileSync(`${cwd}/graph.html`, `</div>`);
				}
			}

			// check functions

			//ITERATE THROUGH FILES FROM INHERITANCE ARRAY, FIND ALL FUNCTIONS THERE, AND CHECK IF ANY IS USED IN THE CURRENT FILE!!!

			// NOW IT"S TIME TO DIS

			appendFileSync(`${cwd}/graph.html`, `</div>`);

			appendFileSync(`${cwd}/graph.html`, `</div>`);
		}

		const lines = fileContent.split('\n');
		let newLines = [];
		for await (let line of lines) {
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
			// if file has imports
			else if (regexp.test(line)) {
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
	appendFileSync(
		`${cwd}/graph.html`,
		`        </section>
    </body>

</html>`
	);
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
	let disposable = commands.registerCommand('sol-paths-helper', async () => {
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
			const scopeFiles = await workspace.findFiles('**/scope.*', `{${excludePattern.join(',')}}`);
			const foundryConfigs = await workspace.findFiles('**/foundry.toml', `{${excludePattern.join(',')}}`);

			const hardhatConfig = await workspace.findFiles('**/hardhat.config.{js,ts}', `{${excludePattern.join(',')}}`);

			let neededPath = '';
			if (scopeFiles.length > 1) {
				throw Error('More than 2 scope files');
			} else if (scopeFiles.length === 0) {
				throw Error('No scope file');
			}
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

				const configLines = foundryConfigContent.split('\n');
				for await (let line of configLines) {
					// console.log(line);

					if (line.replace('\r', '').length === 0 || !srcRegexp.test(line)) {
						continue;
					} else {
						neededPath = line.match(matchRegexp)![0].slice(1, -1);

						console.log('NEEDED PATH', neededPath);
					}
				}
			}

			// if (existsSync(neededPath.length ? foundryBaseFolder + `/${neededPath}/scope/` : foundryBaseFolder + '/src/scope/')) {
			// 	throw Error('Scope folder already exists, skipping to watcher');
			// }

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
				const newPath = neededPath.length
					? foundryBaseFolder + `/${neededPath}/scope/` + scopeFileName
					: foundryBaseFolder + '/src/scope/' + scopeFileName;

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
			await globalEdit(scopeNames);

			// runTheWatcher(watcher);
		} catch (error) {
			// if error with foundry config paths etc - just watch files
			console.error(error);
			// runTheWatcher(watcher);
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
