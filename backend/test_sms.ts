import 'dotenv/config';

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY?.replace(/"/g, '');

async function testFast2SMS() {
  const phone = '9999999999'; // Test number
  const otp = '123456';
  const url = 'https://www.fast2sms.com/dev/bulkV2';

  console.log('Testing Fast2SMS with API Key:', FAST2SMS_API_KEY ? 'Present' : 'Missing');

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: FAST2SMS_API_KEY || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'otp',
        variables_values: otp,
        numbers: phone,
        flash: 0,
      }),
    });

    const text = await resp.text();
    console.log('Status Code:', resp.status);
    console.log('Response Body:', text);

    try {
      const json = JSON.parse(text);
      if (json.return) {
        console.log('✅ Test Success: OTP would be sent (if balance exists)');
      } else {
        console.log('❌ Test Failed:', json.message);
      }
    } catch (e) {
      console.log('❌ Non-JSON response received');
    }
  } catch (err: any) {
    console.error('❌ Network Error:', err.message);
  }
}

testFast2SMS();
