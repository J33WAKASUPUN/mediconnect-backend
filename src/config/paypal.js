const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

// Creating an environment
let clientId = process.env.PAYPAL_CLIENT_ID;
let clientSecret = process.env.PAYPAL_CLIENT_SECRET;

// This sample uses SandboxEnvironment. In production, use LiveEnvironment
let environment = new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
let client = new checkoutNodeJssdk.core.PayPalHttpClient(environment);

module.exports = { client };