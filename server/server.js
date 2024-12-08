import express from "express";
import fetch from "node-fetch";
import "dotenv/config";

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PORT = 8888 } = process.env;
const base = "https://api-m.sandbox.paypal.com";
const app = express();

app.set("view engine", "ejs");
app.set("views", "./server/views");

// host static files
app.use(express.static("client"));

// parse post params sent in body in json format
app.use(express.json());




/**
 * Generate an OAuth 2.0 access token for authenticating with PayPal REST APIs.
 * @see https://developer.paypal.com/api/rest/authentication/
 */
const authenticate = async (bodyParams) => {
  const params = {
    grant_type: "client_credentials",
    response_type: "id_token",
    ...bodyParams,
  };

  // pass the url encoded value as the body of the post call
  const urlEncodedParams = new URLSearchParams(params).toString();
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      throw new Error("MISSING_API_CREDENTIALS");
    }
    const auth = Buffer.from(
      PAYPAL_CLIENT_ID + ":" + PAYPAL_CLIENT_SECRET,
    ).toString("base64");

    const response = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      body: urlEncodedParams,
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });
    return handleResponse(response);
  } catch (error) {
    console.error("Failed to generate Access Token:", error);
  }
};


const generateAccessToken = async () => {
  const { jsonResponse } = await authenticate();
  return jsonResponse.access_token;
};

async function handleResponse(response) {
  try {
    const jsonResponse = await response.json();
    return {
      jsonResponse,
      httpStatusCode: response.status,
    };
  } catch (err) {
    const errorMessage = await response.text();
    throw new Error(errorMessage);
  }
}

const createOrder = async (cart) => {
  // use the cart information passed from the front-end to calculate the purchase unit details
  console.log(
    "shopping cart information passed from the frontend createOrder() callback:",
    cart,
  );

  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders`;
  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: "USD",
          value: "110.00",
        },
      },
    ],
    payment_source: {
      paypal: {
        attributes: {
          vault: {
            store_in_vault: "ON_SUCCESS",
            usage_type: "MERCHANT",
            customer_type: "CONSUMER",
          },
        },
        experience_context: {
          return_url: "http://example.com",
          cancel_url: "http://example.com",
          shipping_preference: "NO_SHIPPING",
        },
      },
    },
  };

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // Uncomment one of these to force an error for negative testing (in sandbox mode only). Documentation:
      // https://developer.paypal.com/tools/sandbox/negative-testing/request-headers/
      // "PayPal-Mock-Response": '{"mock_application_codes": "MISSING_REQUIRED_PARAMETER"}'
      // "PayPal-Mock-Response": '{"mock_application_codes": "PERMISSION_DENIED"}'
      // "PayPal-Mock-Response": '{"mock_application_codes": "INTERNAL_SERVER_ERROR"}'
    },
    method: "POST",
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
};


/**
 * Capture payment for the created order to complete the transaction.
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_capture
 */
const captureOrder = async (orderID) => {
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders/${orderID}/capture`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // Uncomment one of these to force an error for negative testing (in sandbox mode only). Documentation:
      // https://developer.paypal.com/tools/sandbox/negative-testing/request-headers/
      // "PayPal-Mock-Response": '{"mock_application_codes": "INSTRUMENT_DECLINED"}'
      // "PayPal-Mock-Response": '{"mock_application_codes": "TRANSACTION_REFUSED"}'
      // "PayPal-Mock-Response": '{"mock_application_codes": "INTERNAL_SERVER_ERROR"}'
    },
  });

  return handleResponse(response);
};


async function getPaymentToken(customerId) {
  if(!customerId) return '';
  const accessToken = await generateAccessToken();
  const url = 'https://api-m.sandbox.paypal.com/v3/vault/payment-tokens?customer_id='+customerId;
  const headers = {
    'Accept': 'application/json',
    'Accept-Language': 'en_US',
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: headers
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error.message);
  }
}


const createUpsaleOrder = async (vaultId, amount) => {
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders`;
  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: "USD",
          value: amount,
        },
      },
    ],
    payment_source: {
      paypal: {
        vault_id: vaultId
      },
    },
  };

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "PayPal-Request-Id": `${Date.now()}`, // Adding a unique request ID
    },
    method: "POST",
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
};


app.post("/api/orders", async (req, res) => {
  try {
    // use the cart information passed from the front-end to calculate the order amount detals
    const { cart } = req.body;
    const { jsonResponse, httpStatusCode } = await createOrder(cart);
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to create order." });
  }
});


app.post("/api/orders/:orderID/capture", async (req, res) => {
  try {
    const { orderID } = req.params;
    const { jsonResponse, httpStatusCode } = await captureOrder(orderID);
    console.log("capture response", jsonResponse);
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to capture order." });
  }
});

app.get("/api/upsale/:customerId/:amount", async (req, res) => {
  try {
    // use the cart information passed from the front-end to calculate the order amount detals
    const { customerId, amount } = req.params; // MinkNeOsHU
    const tokenResult = await getPaymentToken(customerId);
    const vaultId = tokenResult.payment_tokens[0].id;
    const { jsonResponse, httpStatusCode } = await createUpsaleOrder(vaultId, amount);
    res.send(jsonResponse);
  } catch (error) {
    console.error("Upsale Transaction Faled:", error);
    res.status(500).json(error);
  }
});
















app.get("/", async (req, res) => {
  try {
    res.render("checkout", {
      clientId: PAYPAL_CLIENT_ID,
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/upsale", async (req, res) => {
  try {
    res.render("upsale", {
      clientId: PAYPAL_CLIENT_ID,
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Node server listening at http://localhost:${PORT}/`);
});