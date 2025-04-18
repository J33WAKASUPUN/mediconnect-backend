const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Helper function to check page bounds
const checkPageBreak = (doc, height = 150) => {
    if (doc.y > doc.page.height - height) {
        doc.addPage();
        return true;
    }
    return false;
};

exports.generatePaymentReceiptPDF = async (payment, currentUser) => {
    return new Promise((resolve, reject) => {
        try {
            // Initialize document
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 50, bottom: 50, left: 50, right: 50 },
                bufferPages: true,
                autoFirstPage: true
            });

            const fileName = `payment_receipt_${payment._id}.pdf`;
            const uploadDir = 'uploads/receipts';
            
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            
            const filePath = path.join(uploadDir, fileName);
            const writeStream = fs.createWriteStream(filePath);
            
            doc.pipe(writeStream);

            // Modern Header
            doc.rect(0, 0, doc.page.width, 130)
               .fill('#2563eb');

            doc.fontSize(32)
               .font('Helvetica-Bold')
               .fillColor('white')
               .text('PAYMENT RECEIPT', 50, 50, { align: 'center' });

            doc.fontSize(12)
               .text('OFFICIAL PAYMENT RECORD', 50, 90, { align: 'center' });

            // Reset color and add spacing
            doc.fillColor('black');
            doc.y = 150;

            const startY = doc.y;
            
            // Payment Info Card - Left side
            doc.roundedRect(50, startY, 230, 120, 8)
               .fillAndStroke('#f8fafc', '#e2e8f0');

            // Payment Header with accent color
            doc.rect(50, startY, 230, 35, 8)
               .fill('#2563eb');

            doc.fontSize(16)
               .font('Helvetica-Bold')
               .fillColor('white')
               .text('PAYMENT DETAILS', 70, startY + 10);

            // Payment Details
            doc.fillColor('#1e293b')
                .fontSize(12)
                .font('Helvetica-Bold')
                .text(`Amount: $${payment.amount.toFixed(2)}`, 70, startY + 45)
                .fontSize(10)
                .font('Helvetica')
                .text(`Status: ${payment.status}`, 70, startY + 65)
                .text(`Transaction ID: ${payment.transactionDetails?.captureId || 'N/A'}`, 70, startY + 85);

            // Transaction Card - Right side
            doc.roundedRect(315, startY, 230, 120, 8)
               .fillAndStroke('#f8fafc', '#e2e8f0');

            // Transaction Header
            doc.rect(315, startY, 230, 35, 8)
               .fill('#2563eb');

            doc.fontSize(16)
               .font('Helvetica-Bold')
               .fillColor('white')
               .text('TRANSACTION DETAILS', 335, startY + 10);

            // Transaction Details
            doc.fillColor('#1e293b')
                .fontSize(10)
                .font('Helvetica')
                .text(`Payment Date: ${new Date(payment.createdAt).toLocaleString()}`, 335, startY + 45)
                .text(`Payment Method: PayPal`, 335, startY + 65)
                .text(`Receipt #: ${payment._id}`, 335, startY + 85);

            // Appointment Details
            const appointmentY = startY + 135;
            if (payment.appointmentId) {
                doc.roundedRect(50, appointmentY, 495, 80, 8)
                   .fillAndStroke('#f0f9ff', '#93c5fd');

                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .fillColor('#1e40af')
                   .text('APPOINTMENT INFORMATION', 70, appointmentY + 10);

                doc.fontSize(10)
                   .font('Helvetica')
                   .fillColor('#1e293b')
                   .text(`Date: ${new Date(payment.appointmentId.dateTime).toLocaleDateString()}`, 70, appointmentY + 35)
                   .text(`Time: ${new Date(payment.appointmentId.dateTime).toLocaleTimeString()}`, 300, appointmentY + 35)
                   .text(`Doctor: Dr. ${payment.appointmentId.doctorId.firstName} ${payment.appointmentId.doctorId.lastName}`, 70, appointmentY + 55)
                   .text(`Patient: ${payment.appointmentId.patientId.firstName} ${payment.appointmentId.patientId.lastName}`, 300, appointmentY + 55);
            }

            // Footer with current user and timestamp
            doc.rect(0, doc.page.height - 60, doc.page.width, 60)
               .fill('#f8fafc');

            const currentDate = new Date();
            doc.fontSize(8)
               .fillColor('#6b7280')
               .text(
                   `Page 1 of 1`,
                   0,
                   doc.page.height - 40,
                   { align: 'center' }
               );

            doc.fontSize(7)
               .fillColor('#6b7280')
               .text(
                   `Generated on: ${currentDate.toISOString().replace('T', ' ').slice(0, 19)} UTC | Generated by: ${currentUser}`,
                   0,
                   doc.page.height - 25,
                   { align: 'center' }
               );

            // End the document
            doc.end();

            writeStream.on('finish', () => {
                resolve(filePath);
            });

            writeStream.on('error', (error) => {
                reject(error);
            });

        } catch (error) {
            reject(error);
        }
    });
};