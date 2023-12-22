# Solidity Audit Helper

## Features

An extension for helping auditors freely move solidity files without needing to edit import paths. And not only...

- Automatically updates imports on file movement
- Creates the scope folder with all related files ( reads the scope file )
- Checks for potential vulnerabilities ( unchecked returns, balance checks, calls ) and makes @audit comments
- Checks foundry config for security issues. Make sure to run it first before running any scripts in a repo
- Generates sLoc html ( interactive )
- When all tasks are done, the watcher is activated and automatically updates import paths on file movement
- Automatically fills a newly created sol file with a template

- If there is a scope file in the working folder, the extension will either read foundry config to get the source folder and create there the scope folder, of it will just create the src/scope folder and move the files from the scope list into it. Then the watcher will be activated ( the thing that edits the paths automatically on a file move). You can place a .sol file anywhere you want inside of the working folder, it will still have all the right import paths, as well as the other files that imports the moved one.

- If the scope folder already exists, then just the watcher will be activated
- The path for the src/scope folder is based on the foundry.toml or hardhat.config locations ( if both exists, foundry config path will be selected as the base one)
- If there are more than one foundry.toml files, the watcher will be activated with the error asking you to reorganize the project to have only 1 foundry.toml file.

## Instructions

Extension is activated on vscode startup. For scam check and template filler you don't need to do anything.

For creating the scope folder and activating the watcher and all the rest stuff - press F1, find the Run Solidity Audit Helper command and run it.

## Known Issues

- Doesn't support simultaneous multiple files movement, or a folder movement for now.

  **Enjoy!**
