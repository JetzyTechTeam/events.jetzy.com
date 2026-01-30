
import axios from 'axios';
import qs from 'qs';

async function testCheckout() {
    const url = 'http://localhost:3000/api/checkout';

    // Exact data from user's curl
    const tickets = JSON.stringify([
        {
            "id": "697cfb6e20b2abe2ab4475e5",
            "name": "Early bird Ticket",
            "price": 25,
            "description": "Valid till Feb 3rd ",
            "quantity": 1,
            "isSelected": true,
            "priceId": "price_1SvMdeB7XccR5GE01X44bS1I",
            "eventId": "697cf23827f6f5f0d7d8c25a"
        }
    ]);

    const user = JSON.stringify({
        "firstName": "Arsalan",
        "lastName": "Rao",
        "email": "raoarsalanlatif@gmail.com",
        "phone": "03409566404",
        "referralCode": "SHAMAZEHRA100"
    });

    const data = {
        tickets,
        user,
        referralCode: "SHAMAZEHRA100"
    };

    console.log("Sending request to:", url);
    console.log("Parameters:", JSON.stringify(data, null, 2));

    try {
        const response = await axios.post(url, qs.stringify(data), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json, text/plain, */*'
            }
        });

        console.log("Response Success:", response.status);
        console.log("Data:", JSON.stringify(response.data, null, 2));
    } catch (error: any) {
        if (error.response) {
            console.error("Response Error Status:", error.response.status);
            console.error("Response Error Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Request Error:", error.message);
        }
    }
}

testCheckout();
