const moment = require('moment');

const Menu = require('../menu.json');
const Messages = require('../utils/Messages.json');
const Session = require('../models/Session');
const formatGhanaCard = require('../utils/formatGhanaCard');
const sendXMLResponse = require('../utils/XMLResponse');
const registrationAPI = require('../api/registration');

module.exports = async (option, sessionID, msisdn, starcode, timestamp) => {
	const questions = Menu[option];
	const keys = Object.keys(questions);
	let currentIndex = 0;
	let nextIndex = 0;
	let nextQuestion = null;
	let endSession = false;
	let data = {};
	let lastSession = {
		page: null,
		answer: null,
		question: null,
	};

	// get all sessions for this MSISDN
	const sessions = await Session.find({ msisdn: msisdn, option: option }).sort({
		_id: 'desc',
	});

	// init an array of answers in desc order
	const answers = sessions.map((session) => session.answer);

	// this MSISDN has session, use the latest session
	if (sessions.length) {
		lastSession = sessions[0];
		currentIndex = keys.indexOf(lastSession.page);
		nextIndex = currentIndex + 1;
	}

	/************************************************************************
	 **@description Validate
	 ***********************************************************************/
	const validateResponse = await validateLastSession(lastSession, nextIndex);
	if (validateResponse.error === true) {
		return sendXMLResponse(
			sessionID,
			msisdn,
			starcode,
			validateResponse.question,
			1,
			timestamp
		);
	}
	/************************************************************************/

	// skip next of Kin question
	if (lastSession.answer === '2' && lastSession.page === '8') {
		nextQuestion = questions[keys[nextIndex]];
		await Session.create({
			sessionID: sessionID,
			msisdn: msisdn,
			option: option,
			page: keys[nextIndex],
			question: JSON.stringify(nextQuestion),
			answer: 'N/A',
		});

		// increment to the next question
		nextIndex++;
	}

	// Check if there's a next question else finish
	if (questions[keys[nextIndex]]) {
		nextQuestion = questions[keys[nextIndex]];

		// confirm
		if (keys[nextIndex] === 'confirm') {
			answers.reverse();

			data.MSISDN = answers[0];
			data.ICCID = answers[1];
			data.ID = answers[2];
			data.FORENAMES = answers[3].toUpperCase();
			data.SURNAME = answers[4].toUpperCase();
			data.SEX = answers[5] === '1' ? 'MALE' : 'FEMALE';
			data.DOB = answers[6];
			data.ATM = answers[7] === '1' ? 'YES' : 'NO';
			data.NOK = answers[7] === '2' ? 'N/A' : answers[8].toUpperCase();

			nextQuestion = nextQuestion.replace('(MSISDN)', data.MSISDN);
			nextQuestion = nextQuestion.replace('(ICCID)', data.ICCID);
			nextQuestion = nextQuestion.replace('(ID)', data.ID);
			nextQuestion = nextQuestion.replace('(FORENAMES)', data.FORENAMES);
			nextQuestion = nextQuestion.replace('(SURNAME)', data.SURNAME);
			nextQuestion = nextQuestion.replace('(SEX)', data.SEX);
			nextQuestion = nextQuestion.replace('(DOB)', data.DOB);
			nextQuestion = nextQuestion.replace('(ATM)', data.ATM);
			nextQuestion = nextQuestion.replace('(NOK)', data.NOK);
		}

		// ask the next question
		await Session.create({
			sessionID: sessionID,
			msisdn: msisdn,
			option: option,
			page: keys[nextIndex],
			question: JSON.stringify(nextQuestion),
			answer: null,
		});
	}

	// No more questions
	if (!questions[keys[nextIndex]]) {
		endSession = true;
		nextQuestion =
			lastSession.answer === '1' ? Menu['finish'] : Messages.onCancel;

		await Session.deleteMany({ msisdn: msisdn });
	}

	if (lastSession.page === 'confirm') {
		// * call API;
		if (lastSession.answer === '1') {
			answers.reverse();

			data.MSISDN = answers[0];
			data.ICCID = answers[1];
			data.ID = answers[2];
			data.FORENAMES = answers[3].toUpperCase();
			data.SURNAME = answers[4].toUpperCase();
			data.SEX = answers[5] === '1' ? 'MALE' : 'FEMALE';
			data.DOB = answers[6];
			data.ATM = answers[7] === '1' ? 'YES' : 'NO';
			data.NOK = answers[7] === '2' ? 'N/A' : answers[8].toUpperCase();

			registrationAPI(sessionID, msisdn, data, null);
		}
		// await Session.deleteMany({ msisdn: msisdn });
	}

	return sendXMLResponse(
		sessionID,
		msisdn,
		starcode,
		nextQuestion,
		endSession ? 2 : 1,
		timestamp
	);
};

/**
 * @description: Function to validate the last Session's Input
 */
const validateLastSession = async (lastSession) => {
	// ! Validate Customer's MSISDN
	if (lastSession.page === '1') {
		let customerMsisdn = lastSession.answer;
		customerMsisdn = customerMsisdn.substr(customerMsisdn.length - 9);
		if (customerMsisdn.length !== 9) {
			return {
				error: true,
				question: `Invalid MSISDN, try again.\n${lastSession.question.toString()}`,
			};
		}
	}

	// ! Validate ICCID
	if (lastSession.page === '2') {
		const ICCID = lastSession.answer;
		if (ICCID.length !== 6 && ICCID.length !== 19) {
			return {
				error: true,
				question: `Invalid length, try again.\n${lastSession.question.toString()}`,
			};
		}
	}

	// ! Validate NationalID
	if (lastSession.page === '3') {
		const nationalID = formatGhanaCard(lastSession.answer);
		if (!nationalID) {
			return {
				error: true,
				question: `Invalid pin number, try again.\n${lastSession.question.toString()}`,
			};
		}
	}

	// ! Validate gender
	if (lastSession.page === '6') {
		const genderID = lastSession.answer;
		if (!['1', '2'].includes(genderID)) {
			return {
				error: true,
				question: `Invalid option, try again.\n${lastSession.question.toString()}`,
			};
		}
	}

	// ! Validate dateOfBirth
	if (lastSession.page === '7') {
		const dob = lastSession.answer;
		if (dob.length !== 8) {
			return {
				error: true,
				question: `Invalid format, try again.\n${lastSession.question.toString()}`,
			};
		}
	}

	// ! Validate want AirtelTigo money?
	if (lastSession.page === '8') {
		const ATM = lastSession.answer;
		if (!['1', '2'].includes(ATM)) {
			return {
				error: true,
				question: `Invalid option, try again.\n${lastSession.question.toString()}`,
			};
		}
	}

	// ! confirmation
	if (lastSession.page === 'confirm') {
		const confirm = lastSession.answer;
		if (!['1', '2'].includes(confirm)) {
			return {
				error: true,
				question: `Invalid option, try again.\n${lastSession.question.toString()}`,
			};
		}
	}

	return {
		error: false,
		question: null,
	};
};
