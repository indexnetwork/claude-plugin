import { escapeHtml } from "../../escapeHtml";

export const ownerApprovalRequestTemplate = (
  ownerName: string,
  initiatorName: string,
  receiverName: string,
  indexTitle: string,
  approvalUrl: string,
  unsubscribeUrl?: string
) => {
  return {
    subject: escapeHtml(`Action required: Connection request in ${indexTitle}`),
    html: escapeHtml(`
    <div style="font-family: Arial, sans-serif;">
      <p>Hey ${ownerName},</p>
      <p>There is a new connection request in <strong>${indexTitle}</strong> that requires your approval.</p>
      
      <p><strong>${initiatorName}</strong> wants to connect with <strong>${receiverName}</strong>.</p>
      
      <div style="margin: 20px 0;">
        <a href="${approvalUrl}" style="text-decoration: none; font-weight: bold; color: #FFFFFF; background-color: #0A0A0A; font-size: 1.1em; padding: 10px 20px; border-radius: 5px; display: inline-block;">Review Request</a>
      </div>
      
      <p>As the index owner, you can approve or deny this connection to ensure it aligns with the network's goals.</p>
      <p>—Index</p>

      ${unsubscribeUrl ? `
        <div style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px; font-size: 0.8em; color: #888;">
          <a href="${unsubscribeUrl}" style="color: #888; text-decoration: underline;">Unsubscribe</a>
        </div>
      ` : ''}

      <div style="margin-top: 20px; text-align: center;">
          <img src="https://index.network/logo.png" alt="Index" style="height: 24px; opacity: 0.5;" />
      </div>
    </div>
    `),
    text: escapeHtml(`Hey ${ownerName},

There is a new connection request in ${indexTitle} that requires your approval.

${initiatorName} wants to connect with ${receiverName}.

👉 Review Request: ${approvalUrl}

As the index owner, you can approve or deny this connection to ensure it aligns with the network's goals.

—Index

${unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : ''}`)
  };
};
