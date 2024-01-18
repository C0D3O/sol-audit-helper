const bigNumReplace = (content: string) => {
	const bigNumRegexp = new RegExp(/\bBigNumber.from\b\((\d+)\)/g);

	for (let bignum of content.matchAll(bigNumRegexp)) {
		const numbr = bignum[1];
		content = content.replaceAll(bignum[0], numbr);
	}
	return content;
};

const parseEtherDeclarationReplace = (content: string) => {
	const parseEtherDeclRegexp = new RegExp(/(\w+)\s\=\s\b.*parseEther\(['"](\d+\.?\d?)["']\)/g);

	for (let parseEther of content.matchAll(parseEtherDeclRegexp)) {
		const theVar = parseEther[1];
		const theValue = parseEther[2];

		content = content.replaceAll(parseEther[0], `uint ${theVar[0].toLowerCase()}${theVar.slice(1)} = ${theValue} ether`);
	}
	return content;
};

const parseEtherArgReplace = (content: string) => {
	const parseEtherArgRegexp = new RegExp(/((?:ethers\.)?(?:utils\.)?\bparseEther\b)\(['"](\d+\.?\d*)["']\)/g);

	for (let parseEther of content.matchAll(parseEtherArgRegexp)) {
		// const ethersLibText = parseEther[1];
		const theVar = parseEther[2];
		content = content.replaceAll(parseEther[0], `${theVar} ether`);
	}
	return content;
};

const mathReplace = (content: string) => {
	const addRegexp = new RegExp(/.add\((.*?)\)/g);
	const subRegexp = new RegExp(/\.sub\((.*?)\)/g);
	const divRegexp = new RegExp(/.div\((.*?)\)/g);
	const mulRegexp = new RegExp(/.mul\((.*?)\)/g);
	const powRegexp = new RegExp(/.pow\((.*?)\)/g);

	for (let add of content.matchAll(addRegexp)) {
		const arg = add[1];
		content = content.replaceAll(add[0], ` + ${arg}`);
	}
	for (let sub of content.matchAll(subRegexp)) {
		const arg = sub[1];
		content = content.replaceAll(sub[0], ` - ${arg}`);
	}
	for (let div of content.matchAll(divRegexp)) {
		const arg = div[1];
		content = content.replaceAll(div[0], ` / ${arg}`);
	}
	for (let mul of content.matchAll(mulRegexp)) {
		const arg = mul[1];
		content = content.replaceAll(mul[0], ` * ${arg}`);
	}
	for (let pow of content.matchAll(powRegexp)) {
		const arg = pow[1];
		content = content.replaceAll(pow[0], ` ** ${arg}`);
	}
	return content;
};

const bytes32StringReplace = (content: string) => {
	const formatByte32StringRegexpARG = new RegExp(/(?:\bethers\b\.)?(?:\butils\b\.)?\bformatBytes32String\(("\w+"|'\w+'|\w+)\)/g);

	for (let string of content.matchAll(formatByte32StringRegexpARG)) {
		const arg = string[1];
		// content = content.replaceAll(string[0], `bytes ${theVar} = keccak256(abi.encode(${arg}))`);
		content = content.replaceAll(string[0], `keccak256(abi.encode(${arg}))`);
	}
	return content;
};

const bytes32StringDeclarationReplace = (content: string) => {
	const formatByte32StringRegexpDECLARATION = new RegExp(/(\w+)\s\=\s.*\bformatBytes32String\(("\w+"|'\w+'|\w+)\)/g);
	for (let string of content.matchAll(formatByte32StringRegexpDECLARATION)) {
		const theVar = string[1];
		const arg = string[2];
		content = content.replaceAll(string[0], `bytes public constant ${theVar} = keccak256(abi.encode(${arg}))`);
	}
	return content;
};

const bytes32StringArgReplace = (content: string) => {
	const formatByte32StringRegexpARGStorage = new RegExp(/(?:\bethers\b\.)?(?:\butils\b\.)?\bformatBytes32String\(("\w+"|'\w+'|\w+)\)/g);

	for (let string of content.matchAll(formatByte32StringRegexpARGStorage)) {
		const arg = string[1];
		// content = content.replaceAll(string[0], `bytes ${theVar} = keccak256(abi.encode(${arg}))`);
		content = content.replaceAll(string[0], `keccak256(abi.encode(${arg}))`);
	}
	return content;
};

const destructuringReplace = (content: string) => {
	const destructuringRegexp = new RegExp(/\{(.*)\}(?=\s\=\s)/g);

	for (let destructuring of content.matchAll(destructuringRegexp)) {
		const fixedDestructuring = destructuring[0].replace('{', '(').replaceAll('}', ')');
		content = content.replace(destructuring[0], fixedDestructuring);
	}
	return content;
};

export const keyWordsReplace = (content: string) => {
	content = content.replaceAll(/\b(const|await|let|var)\b/g, '');
	return content;
};

const addressReplace = (content: string) => {
	const addressRegexp = new RegExp(/(\w+)\.address/g);

	for (let address of content.matchAll(addressRegexp)) {
		content = content.replace(address[0], `address(${address[1]})`);
	}
	return content;
};
const connectUserReplace = (content: string) => {
	const connectUsersRegexp = new RegExp(/.*(connect\((.*?)\)\.).*/g);

	for (let userConnect of content.matchAll(connectUsersRegexp)) {
		const connectStringPart = userConnect[1];
		const user = userConnect[2];
		const newLine = `vm.prank(${user});\n${userConnect[0].replace(connectStringPart, '')}`;

		content = content.replaceAll(userConnect[0], newLine);
	}
	return content;
};

const sendTxReplace = (content: string) => {
	const sendTxRegexp = new RegExp(/(\w+).\bsendTransaction\(\{(.*)\}\)/g);
	for (let sendTxLine of content.matchAll(sendTxRegexp)) {
		const sender = sendTxLine[1];
		const args = sendTxLine[2];

		content = content.replaceAll(
			sendTxLine[0],
			`(bool sent, ) = ${sender}.call{${args
				.split(',')
				.map((arg) => (arg.trim() === 'value' ? 'value: value' : arg))}}("");\nrequire(sent, "call failed")`
		);
	}
	return content;
};

const uintReplace = (content: string) => {
	const uintRegexp = new RegExp(/((\bconst\b|\blet\b|\bvar\b)\s(\w+)\s)\=\s(?:\d+|[A-Za-z\s_()\.]+(?=\*|\/|\+|\-))\;(.*)?/g);

	for (let uint of content.matchAll(uintRegexp)) {
		const leftSide = uint[1];
		const theVar = uint[3];
		// const comment = uint[4];
		const tempString = uint[0].replaceAll(uint[1], `uint ${theVar[0].toLowerCase()}${theVar.slice(1)}`);
		content = content.replaceAll(uint[0], tempString + ';');
	}
	return content;
};
const uintReplaceWithoutTheWord = (content: string) => {
	const uintRegexpNew = new RegExp(/\s*\t*\w+\s\=\s([\d\._]+)\;/g);

	for (let uint of content.matchAll(uintRegexpNew)) {
		content = content.replace(uint[0], `uint ${uint[0]}`);
	}
	return content;
};

const getTypeFix = (content: string) => {
	const varWithoutATypeRegexp = new RegExp(/(?<!\w+)[\s\t](\w+)\s\=\s(.*)?\;/g);

	for (let varWoType of content.matchAll(varWithoutATypeRegexp)) {
		const theVar = varWoType[1];
		const theRightSide = varWoType[2];
		let tempString = '';
		// for uint
		if (/(?<!\".*|\bnew\b.*|\'.*)[/*+-]/g.test(theRightSide)) {
			tempString = varWoType[0].replace(theVar, `uint ${theVar}`);
			content = content.replace(varWoType[0], tempString);
		}
		//for strings and addresses and bytes
		if (theRightSide.match(/["'](.*)?["']/)) {
			const theStringOrAddressOrBytes = theRightSide.match(/\=\s["']([A-Za-z0-9]+)["']/);
			if (theStringOrAddressOrBytes?.length) {
				const theMatch = theStringOrAddressOrBytes[1];

				if (theMatch[0] === '0' && theMatch[1] === 'x') {
					// an address
					if (theMatch.length === 42) {
						tempString = varWoType[0].replace(theVar, `address ${theVar}`);
						content = content.replace(varWoType[0], tempString);
						content = content.replace(theRightSide, `= ${theMatch}`);
						// bytes
					} else {
						tempString = varWoType[0].replace(theVar, `bytes ${theVar}`);
						content = content.replace(varWoType[0], tempString);
						content = content.replace(theRightSide, `= ${theMatch}`);
					}
					// a string
				} else {
					tempString = varWoType[0].replace(theVar, `string ${theVar} =`);
					content = content.replace(varWoType[0], tempString);
				}
			}
		}
	}
	return content;
};
const getTypeFixStorage = (content: string) => {
	const varWithoutATypeRegexp = new RegExp(/(?<!\w+)[\s\t](\w+)\s(\=\s.*)?\;/g);

	for (let varWoType of content.matchAll(varWithoutATypeRegexp)) {
		const theVar = varWoType[1];
		const theRightSide = varWoType[2];
		let tempString = '';
		// for uint
		if (/(?<!\".*|\bnew\b.*|\'.*)[/*+-]/g.test(theRightSide)) {
			tempString = varWoType[0].replace(theVar, `uint ${theVar}`);
			content = content.replace(varWoType[0], tempString);
		}
		//for strings and addresses and bytes
		if (theRightSide.match(/["'](.*)?["']/)) {
			console.log(theRightSide);

			const theStringOrAddressOrBytes = theRightSide.match(/\=\s["']([A-Za-z0-9]+)["']/);
			if (theStringOrAddressOrBytes?.length) {
				const theMatch = theStringOrAddressOrBytes[1];
				if (theMatch[0] === '0' && theMatch[1] === 'x') {
					// an address
					if (theMatch.length === 42) {
						tempString = varWoType[0].replace(theVar, `address public constant ${theVar}`);
						content = content.replace(varWoType[0], tempString);
						content = content.replace(theRightSide, `= ${theMatch}`);
						// bytes
					} else {
						tempString = varWoType[0].replace(theVar, `bytes public constant ${theVar}`);
						content = content.replace(varWoType[0], tempString);
						content = content.replace(theRightSide, `= ${theMatch}`);
					}
					// a string
				} else {
					tempString = varWoType[0].replace(theVar, `string public constant ${theVar} =`);
					content = content.replace(varWoType[0], tempString);
				}
			}
		}
	}
	return content;
};

// REGEXP FIXES AFTER THE FILES HAVE BEEN TRANFORMED TO SOLIDITY
const solKeccakReplace = (content: string) => {
	const solKeccakRegexp = new RegExp(/(\w+)\s\=\s\bkeccak256\b\(\babi\.encode/g);
	for (let keccak of content.matchAll(solKeccakRegexp)) {
		const theVar = keccak[1];
		const tempString = keccak[0].replace(theVar, `bytes ${theVar}`);
		content = content.replaceAll(keccak[0], tempString);
	}
	return content;
};
const allFuncsArray = [
	addressReplace,
	mathReplace,
	bigNumReplace,
	keyWordsReplace,
	uintReplace,
	uintReplaceWithoutTheWord,
	connectUserReplace,
	parseEtherDeclarationReplace,
	parseEtherArgReplace,
	solKeccakReplace,
	bytes32StringReplace,
	bytes32StringDeclarationReplace,
	bytes32StringArgReplace,
	destructuringReplace,
	sendTxReplace,
	getTypeFix,
];

export const getSignersReplace = (content: string, declarationStorageVars: string[]) => {
	let newSignersLine = '';
	const getSignersRegexp = new RegExp(/\[(.*)\]\s=.*\bgetSigners\(\);/g);

	for (let signersFullString of content.matchAll(getSignersRegexp)) {
		const signers = signersFullString[1].split(', ');
		for (let signer of signers) {
			const lowerCaseSigner = signer[0].toLowerCase() + signer.slice(1);

			newSignersLine += `address ${lowerCaseSigner} = makeAddr("${lowerCaseSigner}");\n`;
			declarationStorageVars.push(`address ${lowerCaseSigner} = makeAddr("${lowerCaseSigner}")`);
		}
	}

	content = content.replaceAll(getSignersRegexp, '');
	return content;
};

export const allInOneReplace = (content: string) => {
	for (let func of allFuncsArray) {
		content = func(content);
	}
	return content;
};

///////////////// STORAGE UTILS !!!!!!! /////////////////////////////
const storageUintReplace = (storageScope: string) => {
	const uintRegex = new RegExp(/((\bconst\b|\blet\b|\bvar\b)\s(\w+)\s)\=\s(?:\d+|[A-Za-z\s_()\.]+(?=\*|\/|\+|\-))\;(.*)?/g);

	for (let uint of storageScope.matchAll(uintRegex)) {
		const leftSide = uint[1];
		const theVar = uint[3];
		// const comment = uint[4];
		const tempString = uint[0].replaceAll(uint[1], `uint public constant ${theVar}`);
		storageScope = storageScope.replaceAll(uint[0], tempString);
	}
	return storageScope;
};
const storageKeccakReplace = (storageScope: string) => {
	const keccakRegexp = new RegExp(/\t*\s*(\w+)\s\=\skeccak256/g);

	for (let keccak of storageScope.matchAll(keccakRegexp)) {
		const theVar = keccak[1];
		// const comment = uint[4];
		const tempString = keccak[0].replaceAll(theVar, `bytes public constant ${theVar}`);

		storageScope = storageScope.replaceAll(keccak[0], tempString);
	}
	return storageScope;
};

const allFuncsArrayForStorage = [bigNumReplace, storageUintReplace, bytes32StringDeclarationReplace, keyWordsReplace, getTypeFixStorage];

export const allInOneReplaceForStorage = (content: string) => {
	for (let func of allFuncsArrayForStorage) {
		content = func(content);
	}
	return content;
};
