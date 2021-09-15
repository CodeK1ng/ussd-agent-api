const axios = require('axios');
const Logger = require('../../utils/Logger');
const formatGhanaCard = require('../../utils/formatGhanaCard');

const action = async (agentID, answers, requestID = null) => {
	const data = {
		requestID: requestID,
		agentID: agentID,
		msisdn: answers[1],
		iccid: answers[2],
		nationalID: formatGhanaCard(answers[3].toUpperCase()),
		suuid: answers[4],
		isMFS: answers[5] == '1' ? true : false,
		nextOfKin: answers[6].toUpperCase(),
		channelID: 'ussd',
	};

	Logger(
		`${requestID}|${agentID}|API|bioRegistrationAPI|request|${JSON.stringify(
			data
		)}`
	);

	const URL = process.env.REGISTRATION_URL;
	const response = await axios.post(URL, data);
	Logger(
		`${requestID}|${agentID}|API|bioRegistrationAPI|response|${JSON.stringify(
			response.data
		)}`
	);
};

module.exports = action;
