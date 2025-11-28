export const connectionRequestTemplate = (fromUserName: string, toUserName: string, synthesis?: string) => ({
    subject: `✨ ${fromUserName} wants to connect with you`,
    html: `
    <div style="font-family: Arial, sans-serif;">
      <p>Hey ${toUserName},</p>
      <p>You’ve got a new connection request on Index, <strong>${fromUserName}</strong> wants to connect with you.</p>
      
      <div style="margin: 20px 0;">
        <a href="https://index.network/inbox" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Go to Index to approve</a>
      </div>
      
      ${synthesis ? `
        <p><strong>What could happen between you two:</strong></p>
        <div>${synthesis}</div>
      ` : ''}
      
      <p>If you’re curious, I’ll make the connection. If not, everything stays quiet.</p>
      <p>—Index</p>
    </div>
  `,
    text: `Hey ${toUserName},

You’ve got a new connection request on Index, ${fromUserName} wants to connect with you.

👉 Go to Index to approve: https://index.network/inbox

${synthesis ? `What could happen between you two:
${synthesis}

` : ''}If you’re curious, I’ll make the connection. If not, everything stays quiet.

—Index`
});
