const axios = require('axios');
const bodyParser = require('body-parser');

// 1. Configuration (Keys are read from Vercel Environment Variables)
// Note: We use process.env to securely load keys set up on the Vercel dashboard.
const CF_CLIENT_ID = process.env.CF_CLIENT_ID; 
const CF_SECRET_KEY = process.env.CF_SECRET_KEY;
const CF_API_URL = "https://sandbox.cashfree.com/pg/orders"; // Sandbox URL
const AMOUNT = 199.00; // Fixed amount

// 2. Main Serverless Function Export
module.exports = async (req, res) => {
    // 2a. CORS Headers (Allow all origins for frontend access)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle pre-flight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only process POST requests
    if (req.method !== 'POST') {
        res.status(405).json({ status: "ERROR", message: "Method Not Allowed" });
        return;
    }

    // 2b. Parse the body (to handle form-urlencoded data sent from the HTML fetch request)
    // Create a parser instance and promisify it
    const jsonParser = bodyParser.urlencoded({ extended: true });
    
    let data;
    try {
        await new Promise((resolve, reject) => {
            jsonParser(req, res, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        // Form data is now in req.body
        data = req.body;
    } catch (e) {
        console.error("Body parsing error:", e);
        res.status(400).json({ status: "ERROR", message: "Invalid request body format." });
        return;
    }

    // 2c. Input Validation (Checking for required fields from the HTML form)
    if (!data.email || !data.name || !data.whatsapp || data.is_form_data !== 'true') {
        res.status(400).json({ status: "ERROR", message: "Missing required user data or form check failed." });
        return;
    }
    
    // 3. Prepare Order Details
    const order_id = "ORDER-" + Date.now() + "-" + Math.floor(Math.random() * 900 + 100);
    const customer_phone = data.whatsapp.replace(/[^0-9]/g, ''); 

    // 4. Cashfree API Payload
    const payload = {
        "order_id": order_id,
        "order_amount": AMOUNT,
        "order_currency": "INR",
        "customer_details": {
            "customer_id": "CUST_" + order_id,
            "customer_email": data.email,
            "customer_phone": customer_phone,
            "customer_name": data.name
        },
        // **return_url:** This URL is where the user will be redirected after payment
        "order_meta": {
            // IMPORTANT: Make sure this final return URL is correct for your status page
            "return_url": "https://pay.hastrekhajyotish.info/payment-status-handler.php?order_id={order_id}&order_token={order_token}",
        },
        // Custom data (Stored as order tags)
        "order_tags": {
            "left_hand_url": data.leftHandUrl || 'N/A', 
            "right_hand_url": data.rightHandUrl || 'N/A', 
            "gender": data.gender || 'N/A',
            "dob": data.dob || 'N/A',
            "question": data.question || 'N/A'
        }
    };

    // 5. Call Cashfree API using Axios
    try {
        const cfResponse = await axios.post(CF_API_URL, payload, {
            headers: {
                "Content-Type": "application/json",
                "x-client-id": CF_CLIENT_ID,
                "x-client-secret": CF_SECRET_KEY,
                "x-api-version": "2022-01-01" 
            }
        });

        // 6. Handle Success Response (HTTP Status 200)
        if (cfResponse.status === 200 && cfResponse.data.payment_session_id) {
            res.status(200).json({
                "status": "SUCCESS",
                "message": "Payment session created successfully.",
                "sessionId": cfResponse.data.payment_session_id,
                "orderId": order_id
            });
        } else {
            // Cashfree returned 200 but something was wrong with the payload/API
            throw new Error(cfResponse.data.message || 'Cashfree API responded with success status but missing session ID.');
        }

    } catch (error) {
        // Handle API Call Errors (Network error, 4xx, 5xx from Cashfree)
        console.error("Error calling Cashfree API:", error.response ? error.response.data : error.message);
        
        const errorData = error.response ? error.response.data : {};
        const httpStatus = error.response ? error.response.status : 500;

        const errorMessage = `Cashfree API Error (${httpStatus}): ${errorData.message || error.message || 'Unknown API or Network Failure.'}`;
        
        res.status(httpStatus).json({
            "status": "ERROR",
            "message": errorMessage,
            "cf_response": errorData 
        });
    }
};
