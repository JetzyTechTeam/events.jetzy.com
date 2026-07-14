export const authEndpoints = {
	login: "public:/authorize",
	signup: "public:/create",
	createUser: "thirdparty:/v1/accounts/create",
	ssoAuthorize: "external:/v1/accounts/sso/authorize",
	ssoSignup: "external:/v1/accounts/sso/signup",
	referralVerify: "external:/v1/referral/verify",
}
