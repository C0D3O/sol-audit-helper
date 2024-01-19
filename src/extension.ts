import { FileSystemWatcher, Uri, commands, workspace, RelativePattern, ExtensionContext, window, SnippetString, comments } from 'vscode';

import path from 'node:path';
import { existsSync, writeFileSync, readFileSync, renameSync, mkdirSync } from 'node:fs';
import { generateSlocReport, getFolders, osPathFixer, pathLogic, pathLogic2, pathLogicGlobal } from './utils';
import { allInOneReplace, allInOneReplaceForStorage, getSignersReplace } from './converterUtils';

const excludePattern = [
	'**/node_modules/**',
	'**/lib/**',
	'**/out/**',
	'**/.git/**',
	'**/artifacts/**',
	'**/coverage/**',
	'**/cache_forge/**',
	'**/cache/**',
	'**/.github/**',
	'**/.vscode/**',
	'**/.yarn/**',
	'**/hh-cache/**',
];
const excludeFindScopeFilesPattern = [
	'**/node_modules/**',
	'**/out/**',
	'**/.git/**',
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
const foldersToSkip = [
	'lib',
	'out',
	'node_modules',
	'.git',
	'cache_forge',
	'cache',
	'coverage',
	'artifacts',
	'.github',
	'.vscode',
	'.yarn',
	'hh-cache',
];

const skipImports = ['hardhat', 'lib', 'halmos', 'forge', 'openzeppelin', 'forge-std', 'solady', 'solmate'];
// it also reads all folders in the lib folder and adds them to skipImports
if (existsSync(`${cwd}/lib`)) {
	skipImports.push(...getFolders(`${cwd}/lib`));
}

const skipRegexp = new RegExp(`^import\\s(?:{.*}\\sfrom\\s)?["'](\b(@?)${skipImports.join('|')}\b).*\\.sol["'];`, 'i');

const callRegexp = new RegExp(/.*\.(call|delegatecall)({.*})?\(/i);
const balanceCheckRegexp = new RegExp(/(?=.*(>|<|>=|<=|==))(?=.*balance).*/i);
const uncheckedReturnRegexp = new RegExp(/(\s)?\(bool\s.*\=/i);
const alreadyBookmarkedLine = new RegExp(/\/\/\s@audit(-info|-issue|-ok)?/i);
///
const regexSubtract = new RegExp(`^${cwd}(\/)?`);
const extractTheImportPart = new RegExp(/[\s\S]*(?=^\bcontract\b|^\babstract contract\b|^\binterface\b|^\blibrary\b)/m);
const importRegexpNew = new RegExp(`^import\\s(?:(\\{.*\\}\\sfrom\\s))?["'](?!@|\\b${skipImports.join('|')}\\b)(.*)?(\\b\\w+\\.sol\\b)["'];`, 'gm');
///
///
let shouldBeSkipped = false;
let globalEditEnabled = true;
let slocGenerate = true;
//
const winCwd = cwd.replaceAll('/', '\\\\');

const combinedRegex =
	process.platform === 'win32'
		? new RegExp(`${winCwd}\\\\(${foldersToSkip.join('|')}).*`, 'i')
		: new RegExp(`${cwd}/(${foldersToSkip.join('|')}).*`, 'i');

const watcher = workspace.createFileSystemWatcher(new RelativePattern(cwd, '**/*.sol'));

const watcherLogic = async (e: Uri) => {
	const filesToWatch = await workspace.findFiles('**/*.sol', `{${excludePattern.join(',')}}`);

	for await (let file of filesToWatch) {
		const fileName = path.basename(file.path);
		const movedFileName = path.basename(e.path);

		// LOGIC FOR THE MOVED FILE
		if (fileName === movedFileName) {
			let movedFileContent = readFileSync(e.fsPath, 'utf8');

			const importPart = movedFileContent.match(extractTheImportPart);
			if (importPart?.length) {
				const allImports = Array.from(importPart[0].matchAll(importRegexpNew));
				if (allImports?.length) {
					for await (let importline of allImports) {
						let updatedLine: string = '';
						for await (let file of filesToWatch) {
							const fileName = path.basename(file.path);
							const movedFileName = path.basename(e.path);
							if (fileName === movedFileName) {
								continue;
							}
							let theBracesImport = importline[1] ? importline[1] : '';
							const depName = importline[3];

							if (depName === fileName) {
								const otherFilePath = osPathFixer(file.path).replace(regexSubtract, '');
								const movedFilePath = osPathFixer(e.path).replace(regexSubtract, '');

								updatedLine = pathLogic(otherFilePath, movedFilePath, depName, theBracesImport);
							}
						}
						if (updatedLine) {
							movedFileContent = movedFileContent.replace(new RegExp(importline[0], 'm'), updatedLine);
						}
					}

					try {
						writeFileSync(e.fsPath, movedFileContent, 'utf8');
					} catch (error) {
						console.log('WRITING ERROR', error);
					}
				}
			}
			// LOGIC FOR OTHER FILES
		} else {
			let otherFileContent = readFileSync(file.fsPath, 'utf8');
			const importPart = otherFileContent.match(extractTheImportPart);
			if (importPart?.length) {
				const allImports = Array.from(importPart[0].matchAll(importRegexpNew));

				if (allImports?.length) {
					for await (let importline of allImports) {
						let updatedLine: string = '';

						const depName = importline[3];

						if (depName === movedFileName) {
							const pathOfAFileToEdit = osPathFixer(file.path).replace(regexSubtract, '');
							const newPath = osPathFixer(e.path).replace(regexSubtract, '');

							let theBracesImport = importline[1] ? importline[1] : '';

							updatedLine = pathLogic2(pathOfAFileToEdit, newPath, depName, theBracesImport);
						}
						if (updatedLine) {
							otherFileContent = otherFileContent.replace(new RegExp(importline[0], 'm'), updatedLine);
						}
					}

					try {
						writeFileSync(file.fsPath, otherFileContent, 'utf8');
					} catch (error) {
						console.log('WRITING ERROR', error);
					}
				}
			}
		}
	}
};

const globalEdit = async (parseFilesForPotentialVulnerabilities: boolean) => {
	// const excludePattern = ['**/node_modules/**', '**/lib/**', '**/out/**', '**/.git/**'];
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

						line = pathLogicGlobal(currentFilePath, otherFilePath, depName, line, theBracesImport);
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

const fillerLogic = (e: Uri) => {
	// FILLER PART
	// console.log('ACTIVE NAME', window.activeTextEditor?.document.uri.fsPath);
	// console.log('NAME', path.basename(e.path));
	// console.log(osPathFixer(e.path));

	if (window.activeTextEditor?.document.uri.fsPath === e.fsPath) {
		const fileNameForFiller = path.basename(e.path);
		// for test files
		if (fileNameForFiller?.includes('.t.')) {
			const firstLetterToUpperCase = fileNameForFiller.charAt(0).toUpperCase();
			const fileName = firstLetterToUpperCase + fileNameForFiller.slice(1, -6);
			const snippet = new SnippetString(`// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {console} from "forge-std/console.sol";

contract ${fileName} is StdInvariant, Test {
	$1

	function setUp() public {
		$2
	}

	function test_$3() public{
		$4
	}

	function invariant_$5() public{
		$6
	}
}`);

			!window.activeTextEditor?.document.getText() && window.activeTextEditor?.insertSnippet(snippet);
			// for regular files
		} else {
			const firstLetterToUpperCase = fileNameForFiller.charAt(0).toUpperCase();
			const fileName = firstLetterToUpperCase + fileNameForFiller.slice(1, -4);
			const snippet = new SnippetString(`// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.23;

contract ${fileName} {
		$1
}`);
			!window.activeTextEditor?.document.getText() && window.activeTextEditor?.insertSnippet(snippet);
		}
	}
};

const runTheWatcher = (watcher: FileSystemWatcher) => {
	watcher.onDidCreate(async (e) => {
		if (!combinedRegex.test(e.fsPath)) {
			await watcherLogic(e);
		}
	});
};

export function activate(context: ExtensionContext) {
	// activate filler separately
	watcher.onDidCreate(async (e) => {
		if (!combinedRegex.test(e.fsPath)) {
			fillerLogic(e);
		}
	});

	(async () => {
		try {
			// search for red flags in configs
			const foundryConfigs = await workspace.findFiles('**/foundry.toml', `{${excludePattern.join(',')}}`);

			for await (let config of foundryConfigs) {
				const foundryConfigContent = readFileSync(config.fsPath, 'utf8');

				if (/ffi = true/.test(foundryConfigContent)) {
					throw Error('SCAM ALERT!!! FFI is enabled...');
				}
			}
		} catch (error: any) {
			if (error.message === 'SCAM ALERT!!! FFI is enabled...') {
				await window.showErrorMessage('SCAM ALERT!!! FFI is enabled. Do not run any scripts, just carefully delete the repo from your device.');
				return;
			} else {
				console.log(error);
			}
		}
	})();

	let disposable = commands.registerCommand('sol-audit-helpers', async () => {
		const extSettings = workspace.getConfiguration('sol-audit-helper');

		try {
			// const extSettings = workspace.getConfiguration('sol-audit-helper');

			let foundryBaseFolder: string = '';

			// search for scope files
			// const excludePattern = ['**/node_modules/**', '**/lib/**', '**/out/**', '**/.git/**'];
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
						tempString.pop();
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

						// console.log('NEEDED PATH', neededPath);
					}
				}
			}

			const scopeFiles = await workspace.findFiles('**/scope.txt', `{${excludePattern.join(',')}}`);

			if (scopeFiles.length > 1) {
				throw Error('More than 2 scope files');
			} else if (scopeFiles.length === 0) {
				throw Error('No scope file');
			}

			const scopeFileContent = readFileSync(scopeFiles[0].fsPath, 'utf8');
			const lines = scopeFileContent.split('\n');
			let slocFiles: string[] = [];
			for await (let line of lines) {
				if (line.replace('\r', '').length === 0) {
					continue;
				}
				const scopeFileName = path.basename(line.replace('\r', ''));

				const findScopeFiles = await workspace.findFiles(`**/${scopeFileName}`, `{${excludeFindScopeFilesPattern.join(',')}}`);

				if (findScopeFiles.length === 0) {
					throw Error('File from the scope not found, aborting...');
				} else if (findScopeFiles.length > 1) {
					throw Error('Duplicate from the scope found, aborting...');
				}
				let oldPath = findScopeFiles[0].fsPath;

				if (oldPath.includes('scope')) {
					console.log('@@@@@@@@@@@@ GLOBAL EDIT DISABLED @@@@@@@@@');

					globalEditEnabled = false;
					slocGenerate = false;
					break;
				} else {
					await new Promise(async (resolve) => {
						let success = false;
						while (!success) {
							try {
								let oldPathOriginal = oldPath;

								oldPath = oldPath.includes('\\')
									? oldPath.replaceAll('\\', '/').replace(foundryBaseFolder, '')
									: oldPath.replace(foundryBaseFolder, '');

								console.log('OLDPATH', oldPath);
								console.log(oldPath.split('/').slice(1)[0]);

								let newFilePathWithName =
									oldPath.split('/').slice(1)[0] !== 'lib'
										? foundryBaseFolder + '/' + oldPath.split('/').slice(1)[0] + '/scope/' + oldPath.split('/').slice(2).join('/')
										: foundryBaseFolder + '/scope/' + oldPath.split('/').slice(2).join('/');
								let newFilePath = newFilePathWithName.slice(0, newFilePathWithName.lastIndexOf('/'));

								console.log(newFilePath);

								if (!existsSync(newFilePath)) {
									mkdirSync(newFilePath, { recursive: true });
								}

								// get path for SLOC
								slocFiles.push(newFilePathWithName);

								renameSync(oldPathOriginal, newFilePathWithName);
								success = true;
							} catch (error: any) {
								console.log('ERROR', error);

								if (error.message.includes('ENOENT')) {
									console.log('Wrong path');
									console.log('SCOPE FILES NAME', scopeFileName);
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
			}
			// remove empty folders in the scope folder
			//
			slocGenerate && extSettings.get('slocReportFile') && (await generateSlocReport(cwd, slocFiles));

			// START GLOBAL PATH EDITING
			globalEditEnabled && (await globalEdit(extSettings.get('parseFilesForPotentialVulnerabilities')!));
			// temporary workaround
			// await new Promise((r) => setTimeout(r, 2000));
			// and run the watcher
			runTheWatcher(watcher);
		} catch (error: any) {
			if (error.message === 'SCAM ALERT!!! FFI is enabled, aborting...') {
				await window.showInformationMessage(
					'SCAM ALERT!!! FFI is enabled, aborting... Do not run any scripts, just carefully delete the repo from your device.'
				);
				return;
			} else if (error.message === 'Scope folder already exists, skipping to watcher') {
				window.showInformationMessage('Scope folder already exists, skipping to watcher');

				runTheWatcher(watcher);
			} else if (error.message === 'No scope file') {
				window.showInformationMessage('No scope file found... Skipping to watcher');

				runTheWatcher(watcher);
			} else if (error.message === 'More than 2 scope files') {
				await window.showInformationMessage('More than 2 scope files, aborting... ');
				return;
			} else if (error.message === 'Duplicate file from the scope list found, aborting...') {
				await window.showInformationMessage('Duplicate from the scope found, aborting...');
				return;
			} else if (error.message === 'File from the scope not found, aborting...') {
				await window.showInformationMessage('File from the scope not found, aborting...');
				return;
			} else if (error.message === 'No configs found') {
				await window.showInformationMessage('No configs found, aborting... ');
				return;
			} else {
				console.log('ELSE ERROR');
				console.log(error);

				runTheWatcher(watcher);
			}
		}
		context.subscriptions.push(disposable);
	});

	let disposable2 = commands.registerCommand('sol-audit-convert', async () => {
		const template = (fileName: string, importStatements?: string[]) => {
			return `// SPDX-License-Identifier: UNLICENSED
		pragma solidity 0.8.23;
		
		${importStatements?.join('\n')}
		
		import {Test} from "forge-std/Test.sol";
		import {StdInvariant} from "forge-std/StdInvariant.sol";
		import {console} from "forge-std/console.sol";
		
		contract ${fileName} is StdInvariant, Test {
		
		`;
		};
		try {
			const testFiles = await workspace.findFiles(`test/*.{js,ts}`, `{${excludePattern.join(',')}}`);
			//need to filter out test files from regular helper files
			for await (let testFile of testFiles.filter((file: Uri) => /(?:\s+|\t+)\bdescribe\b\(.*\s\{/.test(readFileSync(file.fsPath, 'utf-8')))) {
				let fileContent = readFileSync(testFile.fsPath, 'utf-8');
				const declarationStorageVars: string[] = [];
				const constantFromImportArray: string[] = [];
				const funcsFromImportArray: string[] = [];
				// js/ts import part
				const jsTsImportPartRegExp = new RegExp(/([\s\S]+?)\bdescribe\b\(.*\s\{/);
				const jsTsImportsRegexp = new RegExp(/(?:const|let)\s\{\s*([A-Za-z\n\,\t\s_]+?)\}\s\=\s\brequire\(["']([./]+\w+)["']\)\;/g);

				const importPart = fileContent.match(jsTsImportPartRegExp);
				if (importPart?.length) {
					for (let importLine of importPart[0].matchAll(jsTsImportsRegexp)) {
						const importVars = importLine[1].split(',');

						const pathAndFile = importLine[2];
						// console.log(pathAndFile);

						const splitPathAndFileRegexp = new RegExp(/([\.\/]*)(\w+)/);
						const splitPathAndFile = pathAndFile.match(splitPathAndFileRegexp);
						if (splitPathAndFile?.length) {
							const jsTsImportPath = splitPathAndFile[1];
							const jsTsImportFileName = splitPathAndFile[2];

							const theImportFile = await workspace.findFiles(`**/${jsTsImportFileName}.{js,ts}`, `{${excludePattern.join(',')}}`);
							if (theImportFile.length === 1) {
								const impFileContent = readFileSync(theImportFile[0].fsPath, 'utf-8');

								for (let importVar of importVars) {
									const constantImportVarRegExp = new RegExp(`\\bconst\\b\\s${importVar.trim()}\\s\\=\\s([^\\n]+)\;(.*)?`, 'g');
									console.log(constantImportVarRegExp);

									const theNeededLine = impFileContent.matchAll(constantImportVarRegExp);
									for (let constantVar of theNeededLine) {
										const solLine = `const ${importVar.trim()} = ${constantVar[1]};${constantVar[2] || ''}`;

										!constantFromImportArray.includes(solLine) && constantFromImportArray.push(solLine);
									}
									// find all funcs
									// const funcsImportRegexp = new RegExp(/(?:const|let|var)\s\w+\s\=\s(?:\basync\b\s)?(\(.*\)|_)\s\=\>\s(.*\;|[\s\S]+?\}\;)/g);
									const funcsImportRegexp = new RegExp(
										/(?:const|let|var)\s(\w+)\s\=\s(?:\basync\b\s)?(?:\(([\s\S]*?)\)|_)\s\=\>\s(?:(.*)\;|([\s\S]+?)\}\;)/g
									);

									const allImpFuncs = impFileContent.matchAll(funcsImportRegexp);
									for (let impFunc of allImpFuncs) {
										const funcName = impFunc[1];
										const funcArgs = impFunc[2];
										let funcContent = impFunc[3] || impFunc[4];

										//adding missing { } to the content beginning or ending if needed
										if (funcContent[0] !== '{') {
											funcContent = '{' + funcContent;
										}
										if (funcContent[funcContent.length - 4] !== ';') {
											funcContent = funcContent + '}';
										}

										const solLine = `function ${funcName}(${funcArgs && funcArgs.split(',').map((arg) => arg.trim())}) internal ${funcContent}`;

										!funcsFromImportArray.includes(solLine) && funcsFromImportArray.push(solLine);
									}
								}
							} else {
								throw Error('Duplicate or None Import js Files found');
							}
						}
					}
				}
				let internaLFuncsScope = '';
				for (let internalFunc of funcsFromImportArray) {
					internaLFuncsScope += '\n\n' + internalFunc;
				}
				//HERE
				fileContent = getSignersReplace(fileContent, declarationStorageVars);
				fileContent = allInOneReplace(fileContent);
				internaLFuncsScope = allInOneReplace(internaLFuncsScope);

				let storageVars: string[] = [];

				//////////////////// SETUP SCOPE !!!!!!!! ///////////////////
				const setupRegexp = new RegExp(/\bbefore.*\{([\s\S]+?)\}\)/);
				let setupScope = fileContent.match(setupRegexp)![1];

				const deploymentContractNames: string[] = [];
				const deploymentRegexp = new RegExp(/(\w+)\s\=.*Factory\(['"]([A-Za-z0-9_]+)["']\).*deploy\((.*)\)/g);
				const deployments = fileContent.matchAll(deploymentRegexp);

				for await (let deployment of deployments) {
					const theVar = deployment[1];
					const deploymentContractName = deployment[2];
					const deploymentArgs = deployment[3];

					// store all contractNames into the array to import them later
					if (deploymentContractName && !deploymentContractNames.includes(deploymentContractName)) {
						deploymentContractNames.push(deploymentContractName);
					}

					!declarationStorageVars.includes(`${theVar[0].toUpperCase()}${theVar.slice(1)} ${theVar[0].toLowerCase()}${theVar.slice(1)}`) &&
						declarationStorageVars.push(
							`${deploymentContractName[0].toUpperCase()}${deploymentContractName.slice(1)} ${theVar[0].toLowerCase()}${theVar.slice(1)}`
						);

					storageVars.push(`${theVar[0].toLowerCase()}${theVar.slice(1)}`);
					// add storage vars to the array
					// replaceAll if they match.tolowercase with the correct storage var

					setupScope = setupScope.replace(
						deployment[0],
						`${theVar.toLowerCase()} = new ${deploymentContractName[0].toUpperCase()}${deploymentContractName.slice(1)}(${deploymentArgs})`
					);
					// fileContent = fileContent.replace(
					// 	deployment[0],
					// 	`${theVar.toLowerCase()} = new ${deploymentContractName[0].toUpperCase()}${deploymentContractName.slice(1)}(${deploymentArgs})`
					// );
				}
				const otherVarsRegexp = new RegExp(/(?<!\bconst\b|\blet\b|\bvar\b)(?:\s|\t+)([A-Z]\w+)\s\=/g);

				for (let otherVar of setupScope.matchAll(otherVarsRegexp)) {
					declarationStorageVars.push(
						`${otherVar[1][0].toUpperCase()}${otherVar[1].slice(1)} ${otherVar[1][0].toLowerCase()}${otherVar[1].slice(1)}`
					);

					!storageVars.includes(otherVar[1]) && storageVars.push(`${otherVar[1][0].toLowerCase()}${otherVar[1].slice(1)}`);
				}

				for (let storageVar of storageVars) {
					// fileContent = fileContent.replaceAll(new RegExp(storageVar, 'gi'), storageVar);

					setupScope = setupScope.replaceAll(new RegExp(`(?<!new\\s)\\b${storageVar}\\b`, 'gi'), storageVar);

					// fileContent = fileContent.replaceAll(new RegExp(`(?<!new\\s)\\b${storageVar}\\b`, 'gi'), storageVar);
				}

				setupScope = 'function setUp() public { \n' + setupScope + '\n}';

				setupScope = allInOneReplace(setupScope);

				//////////////// STORAGE SCOPE !!!!!!!!!!!!/////////////////
				let storageScope = '';
				for (let constant of constantFromImportArray) {
					storageScope += constant + '\n';
				}
				storageScope += '\n';

				for (let storageVar of declarationStorageVars) {
					//<---- filter out the visual separator (empty new line)
					storageScope += storageVar + ';\n';
				}
				storageScope += '\n';

				storageScope = allInOneReplaceForStorage(storageScope);

				//tests scopes
				let testsArray: string[] = [];
				const testsRegexp = new RegExp(/\bit\b\(["'](.*)["']\,.*(?!\{)([\s\S]*?)\n\t*\}\);/g);

				const tests = fileContent.matchAll(testsRegexp);
				for (let test of tests) {
					const testName = test[1]
						.replaceAll(',', '')
						.split(' ')
						.map((eachWord, index) => (index === 0 ? eachWord : eachWord[0].toUpperCase() + eachWord.slice(1)))
						.join('');

					let testContent = test[2];
					// expect not revert
					const expectNotRevertRegex = new RegExp(/(?:\w+\s\=\s(.*;)\n*\t*\s*)?\bexpect\b\((.*)\).*\.\bnot\b.*(?:\breverted\b)/g);
					for (let notReverted of testContent.matchAll(expectNotRevertRegex)) {
						const callLine = notReverted[1];
						const theVar = notReverted[2];
						if (/[^a-zA-Z]+/.test(theVar)) {
							// it means it's a statement
							testContent = testContent.replaceAll(notReverted[0], `vm.expectTrue(${theVar})`);
						} else {
							testContent = testContent.replaceAll(notReverted[0], `(bool ${theVar}, ) = ${callLine}\nvm.expectTrue(${theVar})`);
						}
					}
					//expect revert
					const expectedRevertRegex = new RegExp(/(?:\w+\s\=\s(.*;)\n*\t*\s*)?\bexpect\b\((.*)\).*(?:\breverted|revertedWith\b)\(['"](.*)['"]\)\;/g);

					for (let expectedRevert of testContent.matchAll(expectedRevertRegex)) {
						const correctLine = expectedRevert[1];
						const theVarOrStatement = expectedRevert[2];
						const revertMessage = expectedRevert[3];

						if (revertMessage && correctLine) {
							testContent = testContent.replaceAll(expectedRevert[0], `vm.expectRevert("${revertMessage}");\n${correctLine}`);
						} else if (revertMessage && !correctLine) {
							if (/[^a-zA-Z]+/.test(theVarOrStatement)) {
								// it means it's a statement
								testContent = testContent.replaceAll(expectedRevert[0], `vm.expectRevert("${revertMessage}");\n${theVarOrStatement};`);
							} else {
								testContent = testContent.replaceAll(expectedRevert[0], `vm.expectRevert("${revertMessage}");`);
							}
						} else {
							testContent = testContent.replaceAll(expectedRevert[0], `vm.expectRevert()`);
						}
					}

					//expect eq
					const expectEqRegexp = new RegExp(/\bexpect\((.*)\)\.(?:\bto.equal\b|\bequals\b|is\b)\((.*)\)/g);
					for (let expectEq of testContent.matchAll(expectEqRegexp)) {
						const firstVar = expectEq[1];
						const secondVar = expectEq[2];

						testContent = testContent.replaceAll(expectEq[0], `assertEq(${firstVar},${secondVar})`);
					}

					//expec emit
					// console.log(testContent);

					const expectEmitRegexp = new RegExp(/expect\((.*?)\)\.\b(?:to\.)?emit\b\((.*?)\)(?:\.\bwithArgs\((.*?)\));/g);
					for (let expectEmit of testContent.matchAll(expectEmitRegexp)) {
						const theVar = expectEmit[1];
						const theEventEmitter = expectEmit[2].split(',')[0].trim();
						const theEventName = expectEmit[2].split(',')[1].trim().slice(1, -1);
						const theArgs = expectEmit[3];

						// const getTheNeededStateMentRegexp = new RegExp(`(?<=\\bexpect\\b\\(\\b${theVar}\\b\\)[\\s\\S]*)${theVar}\\s\\=(.*)`);
						// const theStatement = testContent.match(getTheNeededStateMentRegexp);

						// if (theStatement) {
						testContent = testContent.replaceAll(
							expectEmit[0],
							`vm.expectEmit(address(${theEventEmitter}));\n
						emit ${theEventEmitter}.${theEventName}(${theArgs});\n
						
					`
						);
						// }
					}

					// fixing duplicate sent vars
					let sentVarsCounter = 0;
					for (let sent of testContent.matchAll(/\(bool sent,\s\)(.*\n\s*\t*)require\(sent/g)) {
						const index = sent.index;
						if (sentVarsCounter !== 0) {
							testContent =
								testContent.substring(0, index) +
								`(bool sent${sentVarsCounter}, )${sent[1]}require(sent${sentVarsCounter},` +
								testContent.substring(index! + `(bool sent${sentVarsCounter}, )${sent[1]}require(sent${sentVarsCounter}`.length);
						}
						sentVarsCounter++;
					}

					// fixing CAPITAL LETTERS vars
					// THIS NEEDS TO HAVE A FILTER FOR CONSTANTS!!!!!!!!!
					const capLettersVarsRegexp = new RegExp(/[^'"]\b([A-Z]\w+)\b[^"''(]/g);
					for (let capLetterVar of testContent.matchAll(capLettersVarsRegexp)) {
						const theVar = capLetterVar[1];

						if (!constantFromImportArray.find((el) => new RegExp(theVar.trim()).test(el))) {
							const tempString = capLetterVar[0].replace(theVar, `${theVar[0].toLowerCase()}${theVar.slice(1)}`);
							testContent = testContent.replaceAll(capLetterVar[0], tempString);
						}
					}

					// forEach
					const forEachRegexp = new RegExp(/(\w+)\.\bforEach\(+([^\)]+)\).*\=\>\s*((.*)\((.*)\))\;/g);
					for (let forEachWord of testContent.matchAll(forEachRegexp)) {
						const theVar = forEachWord[1];
						const eachArg = forEachWord[2];
						let rightSide = forEachWord[3];
						let rightSideBeforeArgs = forEachWord[4];
						let args = forEachWord[5];

						args = args.replaceAll(eachArg, `${theVar}[i]`);

						testContent = testContent.replaceAll(
							forEachWord[0],
							`for (uint i = 0; 0 < ${theVar}.length; i++){\n
					${rightSideBeforeArgs}(${args};
				}`
						);
					}

					// testContent = allInOneReplace(testContent);

					testsArray.push(`function test_${testName}() public{\n${testContent}}`);
				}

				const testsText = testsArray.map((test) => test).join('\n\n\t');
				// console.log(setupScope);
				const currentTestFileName = path.basename(testFile.fsPath).slice(0, -3);

				const importStatements: string[] = [];
				for await (let contractName of deploymentContractNames) {
					// console.log('CONTRACT NAME', contractName);

					const contractFile = await workspace.findFiles(`**/${contractName}.sol`, `{${excludePattern.join(',')}}`);

					if (contractFile.length !== 1 || contractFile.length > 1) {
						throw Error('Contract File not found / duplicate contract');
					} else {
						const currentPath = `test/${currentTestFileName}`;
						// console.log('CURRENT PATH', currentPath);

						const contractFilePath = osPathFixer(contractFile[0].path).replace(regexSubtract, '');
						// console.log('CONTRACT PATH', contractFilePath);

						let importLine = pathLogic2(currentPath, contractFilePath, contractName, `{${contractName}} from `);
						// console.log('IMPORT LINE', importLine);
						!importStatements.includes(importLine) && importStatements.push(importLine);
					}
				}

				// writeFileSync(
				// 	`${cwd}/test/${currentTestFileName}.t.sol`,
				// 	template(currentTestFileName, importStatements) + storageScope + setupScope + testsText + '\n\n' + funcsFromImportArray.join('\n\n') + '}'
				// );
				writeFileSync(
					`${cwd}/test/${currentTestFileName}.t.sol`,
					template(currentTestFileName, importStatements) + storageScope + setupScope + testsText + '}'
				);
				// writeFileSync(
				// 	`${cwd}/test/${currentTestFileName}.t.sol`,
				// 	template(currentTestFileName, importStatements) + storageScope + setupScope + testsText + '\n\n' + internaLFuncsScope + '}'
				// );

				// read return types from the contracts and put them at vars declaration
			}
		} catch (error) {
			console.log(error);
		}
		context.subscriptions.push(disposable2);
	});
}
// This method is called when your extension is deactivated
export function deactivate() {}
