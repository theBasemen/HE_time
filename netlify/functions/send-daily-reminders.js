/**
 * Netlify Scheduled Function
 * Calls Supabase Edge Function to send daily reminders
 * Runs Monday-Friday at 16:00 UTC (17:00 CET)
 */

import { schedule } from '@netlify/functions';

const sendReminders = async (event, context) => {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  if (!supabaseUrl || !serviceRoleKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Missing environment variables',
        message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Netlify environment variables',
      }),
    };
  }

  const functionUrl = `${supabaseUrl}/functions/v1/send-daily-reminders`;

  console.log('Calling Supabase Edge Function:', functionUrl);
  console.log('Scheduled event triggered at:', new Date().toISOString());

  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    console.log('Supabase Edge Function response:', {
      status: response.status,
      data: data,
    });

    return {
      statusCode: response.status,
      body: JSON.stringify({
        message: 'Daily reminders processed',
        timestamp: new Date().toISOString(),
        supabaseResponse: data,
      }),
    };
  } catch (error) {
    console.error('Error calling Supabase Edge Function:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to send daily reminders',
        message: error.message,
        stack: error.stack,
      }),
    };
  }
};

// Schedule: Monday-Friday at 16:00 UTC (17:00 CET / 18:00 CEST)
// Cron format: minute hour day-of-month month day-of-week
export const handler = schedule('0 16 * * 1-5', sendReminders);
