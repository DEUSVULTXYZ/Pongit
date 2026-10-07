/** Reusable human result schemas; agent rules 15/16/17 have a different reference tuple. */
export const isReusableHumanRules=(version:unknown):version is 14|18=>version===14||version===18;
