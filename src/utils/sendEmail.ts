import nodemailer from 'nodemailer';

// async..await is not allowed in global scope, must use a wrapper
// Generate test SMTP service account from ethereal.email
export async function sendEmail(to: string, html: string) {
  // Only needed if you don't have a real mail account for testing
  //   let testAccount = await nodemailer.createTestAccount();
  //   console.log({ testAccount });

  // create reusable transporter object using the default SMTP transport
  let transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: 'j66eithcdybx6b3f@ethereal.email', // generated ethereal user
      pass: 'cJwVSAQ8GWb2fCPUy5', // generated ethereal password
    },
  });

  // send mail with defined transport object
  let info = await transporter.sendMail({
    from: '"Fred Foo 👻" <foo@example.com>', // sender address
    to, // list of receivers
    subject: 'Change Password', // Subject line
    html, // plain text body
  });

  console.log('Message sent: %s', info.messageId);
  //
  console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
}
//
