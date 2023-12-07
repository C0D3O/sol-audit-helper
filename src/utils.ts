import { appendFileSync, readdirSync, writeFileSync } from 'fs';
import sloc from 'node-sloc';

export const getFolders = (source: string) =>
	readdirSync(source, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory())
		.map((dirent) => dirent.name);

export const osPathFixer = (path: string): string => {
	return process.platform === 'win32' ? path.slice(1) : path;
};

// LOGIC FOR THE MOVED FILE !!!
const diffLevelsLogic = (
	anotherFilePathLength: number,
	currentFilePathLength: number,
	anotherFilePathParts: string[],
	currentFilePathParts: string[],
	theAddedPart: string,
	anotherFilePath: string,
	theBracesImport: string,
	depName: string,
	line: string
) => {
	let index = 0;

	const biggerArrayLength = anotherFilePathLength > currentFilePathLength ? anotherFilePathParts.length : currentFilePathParts.length;
	// compare array sequentially
	while (anotherFilePathParts[index] === currentFilePathParts[index] && index < biggerArrayLength) {
		index++;
	}

	// console.log('INDEX', index);
	// console.log('currentFIlePathLength', currentFilePathLength);

	// 5. if files are on different levels
	if (anotherFilePathLength !== currentFilePathLength) {
		if (index === 0) {
			for (let i = 0; i < currentFilePathLength; i++) {
				theAddedPart = theAddedPart + '../';
			}
			line = 'import ' + theBracesImport + '"' + theAddedPart + anotherFilePath + '";';
			// 6. if in the same
		} else {
			// if otherfile deeper

			if (anotherFilePathLength === biggerArrayLength) {
				if (index === currentFilePathLength) {
					for (let i = 0; i < index; i++) {
						anotherFilePathParts.shift();
					}
					line = 'import ' + theBracesImport + '"' + './' + anotherFilePathParts.join('/') + '/' + depName + '";';
				} else {
					for (let i = 0; i < index; i++) {
						anotherFilePathParts.shift();
					}
					for (let i = 0; i < currentFilePathLength - index; i++) {
						theAddedPart = theAddedPart + '../';
					}
					line = 'import ' + theBracesImport + '"' + theAddedPart + anotherFilePathParts.join('/') + '/' + depName + '";';
				}
			}
			// if current file deeper LACKS LOGIC
			else if (currentFilePathLength === biggerArrayLength) {
				for (let i = 0; i < index; i++) {
					anotherFilePathParts.shift();
				}
				for (let i = 0; i < currentFilePathLength - index; i++) {
					theAddedPart = theAddedPart + '../';
				}
				console.log('ANOTHER PARTS LENGTH AFTER SHIFTING', anotherFilePathParts.length);

				if (anotherFilePathParts.length) {
					line = 'import ' + theBracesImport + '"' + theAddedPart + anotherFilePathParts.join('/') + '/' + depName + '";';
					// if after shifting there's no diff path left
				} else {
					line = 'import ' + theBracesImport + '"' + theAddedPart + depName + '";';
				}
			}
		}
	}
	// if on the same
	else {
		// if in completely different folders ( on the same level )
		if (index === 0) {
			for (let i = 0; i < currentFilePathLength; i++) {
				theAddedPart = theAddedPart + '../';
			}
			line = 'import ' + theBracesImport + '"' + theAddedPart + anotherFilePath + '";';
		}
		// if in the same folder
		else if (index === currentFilePathLength) {
			line = 'import ' + theBracesImport + '"' + './' + depName + '";';
		}

		// if some folders are the same
		else {
			for (let i = 0; i < index; i++) {
				anotherFilePathParts.shift();
			}
			for (let i = 0; i < currentFilePathLength - index; i++) {
				theAddedPart = theAddedPart + '../';
			}

			if (anotherFilePathParts.length) {
				line = 'import ' + theBracesImport + '"' + theAddedPart + anotherFilePathParts.join('/') + '/' + depName + '";';
				// if after shifting there's no diff path left
			} else {
				line = 'import ' + theBracesImport + '"' + theAddedPart + depName + '";';
			}
		}
	}
	return line;
};

export const pathLogic = (otherFilePath: string, movedFilePath: string, depName: string, line: string, theBracesImport?: string) => {
	const otherFilePathParts = otherFilePath.split('/');
	const currentFilePathParts = movedFilePath.split('/');

	// removing the depName
	otherFilePathParts.pop();
	currentFilePathParts.pop();

	const otherFilePathLength = otherFilePathParts.length;
	const currentFilePathLength = currentFilePathParts.length;

	let theAddedPart = '';

	// 1. if both files is in root
	if (!otherFilePathLength && !currentFilePathLength) {
		line = 'import ' + theBracesImport + '"' + './' + depName + '";';
	}
	// 2. if otherfile is in root and the movedFile is not
	else if (!otherFilePathLength && currentFilePathLength) {
		for (let i = 0; i < currentFilePathLength; i++) {
			theAddedPart = theAddedPart + '../';
		}
		line = 'import ' + theBracesImport + '"' + theAddedPart + depName + '";';
	}
	// 3. if movedfile is in root and the otherfile is not
	else if (otherFilePathLength && !currentFilePathLength) {
		line = 'import ' + theBracesImport + '"' + './' + otherFilePath + '";';
	} else {
		// if different levels
		line = diffLevelsLogic(
			otherFilePathLength,
			currentFilePathLength,
			otherFilePathParts,
			currentFilePathParts,
			theAddedPart,
			otherFilePath,
			theBracesImport!,
			depName,
			line
		);
	}

	return line;
};

// LOGIC FOR THE REST OF THE FILES, that is also suitable for the global edit..
export const pathLogic2 = (currentFilePath: string, anotherFilePath: string, depName: string, line: string, theBracesImport?: string) => {
	const currentFilePathParts = currentFilePath.split('/');
	const anotherFilePathParts = anotherFilePath.split('/');

	// removing the depName
	currentFilePathParts.pop();
	anotherFilePathParts.pop();

	const currentFilePathLength = currentFilePathParts.length;
	const anotherFilePathLength = anotherFilePathParts.length;

	let theAddedPart = '';

	// 1. if both files are in root
	if (!currentFilePathLength && !anotherFilePathLength) {
		line = 'import ' + theBracesImport + '"' + './' + depName + '";';
		// 2. if current file is in root and other file is not
	} else if (!currentFilePathLength && anotherFilePathLength) {
		line = 'import ' + theBracesImport + '"' + './' + anotherFilePath + '";';
		// 3. if current file is not in the root and other is
	} else if (currentFilePathLength && !anotherFilePathLength) {
		for (let i = 0; i < currentFilePathLength; i++) {
			theAddedPart = theAddedPart + '../';
		}
		line = 'import ' + theBracesImport + '"' + theAddedPart + depName + '";';
	}
	// 4. if both files are not in root
	else {
		line = diffLevelsLogic(
			anotherFilePathLength,
			currentFilePathLength,
			anotherFilePathParts,
			currentFilePathParts,
			theAddedPart,
			anotherFilePath,
			theBracesImport!,
			depName,
			line
		);
	}
	return line;
};

export const htmlTemplate = `
<!DOCTYPE html>
<html>

    <head>
        <title>File Status</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" rel="stylesheet"
            integrity="sha384-rbsA2VBKQhggwzxH7pPCaAqO46MgnOM80zW1RWuH61DGLwZJEdK2Kadq2F9CUG65" crossorigin="anonymous">
        <style>
		* {
			box-sizing: border-box;
			margin: 0;
		}
		
		body {
			background: rgb(19, 47, 50);
			background: linear-gradient(18deg, rgba(19, 47, 50, 1) -50%, rgba(120, 247, 255, 1) 150%);
			background-repeat: no-repeat;
			height: 100vh;
		}
		
		.table-container {
			margin-top: 100px;
		}
		
		table {
			text-align: center;
			border: 3px solid black !important;
			border-radius: 10px;
			padding: 0.4em;
			border-collapse: separate;
		}
		
		tr > td {
			color: aliceblue !important;
			font-size: 1.3rem;
		}
		th {
			border-style: hidden !important;
		}
		tr:last-child > td {
			border-style: hidden !important;
		}
		select {
			text-align: center;
		}
		.form-select {
			background-color: #9f9d9d;
			color: aliceblue;
		}
	    </style>

    </head>

    <body>
        <div class="table-container d-flex justify-content-center">
            <table class="table table-striped w-50">
                <thead>
                    <tr>
                        <th scope="col">File</th>
                        <th scope="col" onclick="sortTable()">sLoc</th>
                        <th scope="col">Status</th>
                    </tr>
                </thead>
                <tbody>
`;
export const generateSlocReport = async (cwd: string, scopeNames: string[], newPath: string) => {
	// CREATE A SLOC REPORT

	writeFileSync(`${cwd}/sLoc.html`, htmlTemplate);
	let id = 'a';
	for await (let scopeFileName of scopeNames) {
		try {
			id += id;
			console.log(`${newPath}${scopeFileName}`);

			const sLocOutput = await sloc({ path: `${newPath}${scopeFileName}`, extensions: ['sol'] });

			let fileName = sLocOutput?.paths[0].split('/').pop()?.slice(0, -4);
			let sLocNumber = sLocOutput?.sloc;

			const DataToAppend = `
	<tr>
		<td>${fileName}</td>
		<td>${sLocNumber}</td>
		<td>
			<select id="${id}" class="form-select" aria-label="Default select example"
				onchange="changeFunc(this)">
				<option value="done">Done</option>
				<option value="in_progress">In Progress</option>
				<option value="not_started" selected>Not Started</option>
			</select>
		</td>
	</tr>`;
			appendFileSync(`${cwd}/sLoc.html`, DataToAppend);
		} catch (error) {
			console.log(error);
		}
	}
	const dataToWrapTheHtmlWith = `
		</tbody>
				</table>
			</div>
			<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js"
				integrity="sha384-kenU1KFdBIe4zVF0s0G1M5b4hcpxyD9F7jL+jjXkk+Q2h455rYXK/7HAuoJl+0I4"
				crossorigin="anonymous"></script>
				<script>
				let ascending = true;

				const sortTable = () => {
					let table, rows, switching, i, x, y, shouldSwitch;
					table = document.querySelector('table');
					switching = true;

					while (switching) {
						switching = false;
						rows = table.rows;

						for (i = 1; i < rows.length - 1; i++) {
							shouldSwitch = false;
							x = parseInt(rows[i].getElementsByTagName('td')[1].innerHTML);
							y = parseInt(rows[i + 1].getElementsByTagName('td')[1].innerHTML);

							if (ascending ? x > y : x < y) {
								shouldSwitch = true;
								break;
							}
						}

						if (shouldSwitch) {
							rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
							switching = true;
						}
					}
					
					// Toggle sorting direction for the next function call
					ascending = !ascending;
				};

		
				const changeFunc = (selectObject) => {
					const value = selectObject.value;
					window.sessionStorage.setItem(selectObject.id, value);
				};
		
				window.onload = () => {
					sortTable();
		
					Object.keys(sessionStorage).forEach(function (selector) {
						const value = sessionStorage.getItem(selector);
		
						document
							.querySelector('#' + selector)
							.querySelectorAll('option')
							.forEach((option) => {
								if (option.value === value) {
									console.log('true');
									option.selected = true;
								}
							});
					});
				};
			</script>
		</body>

	</html>`;
	appendFileSync(`${cwd}/sLoc.html`, dataToWrapTheHtmlWith);
};
