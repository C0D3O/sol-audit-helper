import { FileSystemWatcher, Uri, commands, workspace, RelativePattern, ExtensionContext } from 'vscode';

import path from 'node:path';
import { existsSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { rename, mkdir } from 'node:fs/promises';

import { getFolders, osPathFixer, pathLogic, pathLogic2, htmlTemplate, cssTemplate, jsTemplate } from './utils';

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
	const constructorExtractorRegexp = new RegExp(/(?<=(^|\s+)?\bconstructor\b\(.*\)\s?\{)([^}]*).*(?=\})/g);
	// CONTRACT IS REGEXP
	const contractInheritanceRegexp = new RegExp(/(?<=^contract .* is )[\w*(?:\,\s)]+(?={)/gm);
	writeFileSync(`${cwd}/styles.css`, cssTemplate);
	writeFileSync(`${cwd}/script.js`, jsTemplate);
	writeFileSync(`${cwd}/graph.html`, htmlTemplate);

	for await (let file of allFiles) {
		const fileContent = readFileSync(file.fsPath, 'utf8');
		const fileName = path.basename(file.fsPath);

		//if the file is in the scope
		// CREATE GRAPH

		// check import lines
		// if it's a bracket import  -  push the name into bracketImports array
		//use the last element to GET THE NAME OF THE FILE TO SEARCH FOR OTHER ELEMENTS CONTRACTS and read their content to compare to current files content
		// if it's a full import  -  push the name into fullImports array

		// check all the inheritance imports

		if (scopeNames.includes(fileName)) {
			// CHECK IMPORTS!!!
			const fullImportRegexp = new RegExp(/(?<=^\bimport\b\s+?["'].?\/?)\w+(?=.sol)/gm);
			const bracketsImportRegexp = new RegExp(/\{([^{}]+)\}.*?\/?([^/]+)\.sol/gm);
			// CHECK FULL IMPORTS
			const fullImportNames = fileContent.match(fullImportRegexp);
			if (fullImportNames?.length) {
				console.log('FULL IMPORT NAMES', fullImportNames);
				console.log('FULL IMPORTS CHECKED');
			}
			// CHECK BRACKET IMPORTS
			const bracketImportNames = fileContent.matchAll(bracketsImportRegexp);
			for await (let bracketImportName of bracketImportNames) {
				const importNamesFromBrackets = bracketImportName[1];
				const contractContainingTheBracketImports = bracketImportName[2];

				if (importNamesFromBrackets.includes(',')) {
					const separatedBracketImportNames = importNamesFromBrackets.split(',').map((name) => name.trim());
					console.log(separatedBracketImportNames);

					if (separatedBracketImportNames.length) {
						for await (let separatedName of separatedBracketImportNames) {
							console.log(separatedName);
						}
					}
				} else {
					const importNamesFromBracketsTrimmed = importNamesFromBrackets.trim();
					console.log(importNamesFromBracketsTrimmed);
				}
				console.log(contractContainingTheBracketImports);
				console.log('BRACKED IMPORTS CHECKED');
			}

			// CHECK INHERITANCE IMPORTS
			const contractInheritance = fileContent.match(contractInheritanceRegexp);

			let inheritancesArray: string[] = [];
			if (contractInheritance?.length) {
				for await (let inheritanceFile of contractInheritance) {
					if (inheritanceFile.includes(',')) {
						inheritancesArray = inheritanceFile.split(',').map((name) => name.trim());
					} else {
						console.log('INHERITANCE', inheritanceFile);
					}
				}
				if (inheritancesArray.length) {
					for await (let inheritanceFile of inheritancesArray) {
						console.log('INHERITANCE', inheritanceFile);
					}
					console.log('INHERITANCE IMPORTS CHECKED');
				}
			}

			// const allFuncs = fileContent.match(functionExtractorRegexp);

			// const allConstuctors = fileContent.match(constructorExtractorRegexp);

			// let inhParents: string[] = [];

			//
			//
			// if (importList.length || inheritancesArray.length || allFuncs?.length) {
			// 	appendFileSync(`${cwd}/graph.html`, `<div class='fullFile'>`); // closed

			// 	if (allFuncs?.length) {
			// 		// add header to graph if a file has functions
			// 		appendFileSync(`${cwd}/graph.html`, `<div class='fileName'><h3>${fileName}</h3></div>`); // closed
			// 	}

			// 	appendFileSync(`${cwd}/graph.html`, `<div class='functionsPlusInh'>`); //closed
			// 	appendFileSync(`${cwd}/graph.html`, `<div class='functions'>`); //closed
			// 	// now we need to find functions
			// 	if (allFuncs?.length) {
			// 		for await (let func of allFuncs) {
			// 			// console.log(func + '\n');
			// 			const lines = func.toString().split('\n');
			// 			const firstLine = lines[0];

			// 			const funcName = firstLine.match(/(\w+)(?=\()/)![0];
			// 			appendFileSync(`${cwd}/graph.html`, `<div class='fullFunc'>`); // closed

			// 			if (firstLine.includes('payable')) {
			// 				appendFileSync(`${cwd}/graph.html`, `<div class='func payable'>${funcName}</div>`);
			// 			} else if (firstLine.includes('pure')) {
			// 				appendFileSync(`${cwd}/graph.html`, `<div class='func pure'>${funcName}</div>`);
			// 			} else if (firstLine.includes('external') || firstLine.includes('public')) {
			// 				appendFileSync(`${cwd}/graph.html`, `<div class='func external'>${funcName}</div>`);
			// 			} else {
			// 				appendFileSync(`${cwd}/graph.html`, `<div class='func'>${funcName}</div>`);
			// 			}

			// 			//search for imports
			// 			const funcContentRegexp = new RegExp(/\{[^}]*}/g);
			// 			const funcContent = func.match(funcContentRegexp)![0];
			// 			appendFileSync(`${cwd}/graph.html`, `<div class='inheritance'>`); //closed
			// 			console.log('FUNC CONTENT', funcContent);

			// 			for await (let importName of importList) {
			// 				console.log('IMPORT NAME', importName);

			// 				if (funcContent.includes(importName)) {
			// 					appendFileSync(`${cwd}/graph.html`, `<div>${importName}</div>`);
			// 				}

			// 				if (allConstuctors?.length) {
			// 					for await (let constructorContent of allConstuctors) {
			// 						console.log(constructorContent.includes(importName));
			// 						if (constructorContent.includes(importName)) {
			// 							appendFileSync(`${cwd}/graph.html`, `<div>${importName}</div>`);
			// 						}
			// 					}
			// 				}
			// 			}
			// 			for await (let inheritance of inheritancesArray) {
			// 				for await (let file2 of allFiles) {
			// 					const file2Name = path.basename(file2.fsPath).split('.')[0];

			// 					if (file2Name === inheritance.trim()) {
			// 						const fileContent2 = readFileSync(file2.fsPath, 'utf8');
			// 						const allFuncs2 = fileContent2.match(functionExtractorRegexp);
			// 						if (allFuncs2?.length) {
			// 							for await (let func of fileContent2.matchAll(functionExtractorRegexp)) {
			// 								// console.log(func + '\n');
			// 								const lines = func.toString().split('\n');
			// 								const firstLine = lines[0];

			// 								const funcName = firstLine.match(/(\w+)(?=\()/)![0];
			// 								// BE CAREFULL HERE
			// 								// THE NEXT LINE IS FUNCCONTENT NOT THE FILECONTENT!!!
			// 								if (funcContent.includes(funcName + '(')) {
			// 									//MARK THE INHERITANCE
			// 									if (firstLine.includes('payable')) {
			// 										// appendFileSync(`${cwd}/graph.html`, `<div class='inh-text'>From ${file2Name}`);
			// 										appendFileSync(`${cwd}/graph.html`, `<div class='func payable'>${funcName}</div>`);
			// 									} else if (firstLine.includes('pure')) {
			// 										// appendFileSync(`${cwd}/graph.html`, `<div class='inh-text'>From ${file2Name}`);
			// 										appendFileSync(`${cwd}/graph.html`, `<div class='func pure'>${funcName}</div>`);
			// 									} else if (firstLine.includes('external') || firstLine.includes('public')) {
			// 										// appendFileSync(`${cwd}/graph.html`, `<div class='inh-text'>From ${file2Name}`);
			// 										appendFileSync(`${cwd}/graph.html`, `<div class='func external'>${funcName}</div>`);
			// 									} else {
			// 										// appendFileSync(`${cwd}/graph.html`, `<div class='inh-text'>From ${file2Name}`);
			// 										appendFileSync(`${cwd}/graph.html`, `<div class='func'>${funcName}</div>`);
			// 									}
			// 									if (!inhParents.includes(file2Name)) {
			// 										inhParents.push(file2Name);
			// 									}
			// 								}
			// 							}
			// 						}
			// 						// appendFileSync(`${cwd}/graph.html`, `</div>`);
			// 					}
			// 				}
			// 			}
			// 			appendFileSync(`${cwd}/graph.html`, `</div>`);
			// 			appendFileSync(`${cwd}/graph.html`, `</div>`);
			// 		}
			// 	}
			// 	appendFileSync(`${cwd}/graph.html`, `</div>`);

			// 	if (inhParents.length) {
			// 		appendFileSync(`${cwd}/graph.html`, `<div class='inh-parent'>`);
			// 		for await (let inh of inhParents) {
			// 			if (inh) {
			// 				appendFileSync(`${cwd}/graph.html`, `<h2>${inh}</h2>`);
			// 			}
			// 		}
			// 		appendFileSync(`${cwd}/graph.html`, `</div>`);
			// 	}

			// 	appendFileSync(`${cwd}/graph.html`, `</div>`);

			// 	// closing fullFile div
			// 	appendFileSync(`${cwd}/graph.html`, `</div>`);
			// }
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
