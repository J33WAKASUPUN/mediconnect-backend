const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Helper function to ensure we don't exceed page bounds
const checkPageBreak = (doc, height = 150) => {
    if (doc.y > doc.page.height - height) {
        doc.addPage();
        return true;
    }
    return false;
};

exports.generateMedicalRecordPDF = async (medicalRecord) => {
    return new Promise((resolve, reject) => {
        try {
            // Initialize document with better formatting
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 50, bottom: 50, left: 50, right: 50 },
                bufferPages: true,
                autoFirstPage: true
            });

            const fileName = `medical_record_${medicalRecord._id}.pdf`;
            const uploadDir = 'uploads/pdfs';
            
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            
            const filePath = path.join(uploadDir, fileName);
            const writeStream = fs.createWriteStream(filePath);
            
            doc.pipe(writeStream);

            // Modern Header
            doc.rect(0, 0, doc.page.width, 130)
               .fill('#2563eb'); // Modern blue color

            doc.fontSize(32)
               .font('Helvetica-Bold')
               .fillColor('white')
               .text('MEDICAL RECORD', 50, 50, { align: 'center' });

            doc.fontSize(12)
               .text('CONFIDENTIAL PATIENT INFORMATION', 50, 90, { align: 'center' });

            // Reset color and add spacing
            doc.fillColor('black');
            doc.y = 150;

            const startY = doc.y;
            
            // Patient Card - Left side
            doc.roundedRect(50, startY, 230, 120, 8)
               .fillAndStroke('#f8fafc', '#e2e8f0');

            // Patient Header with accent color
            doc.rect(50, startY, 230, 35, 8)
               .fill('#2563eb');

            doc.fontSize(16)
               .font('Helvetica-Bold')
               .fillColor('white')
               .text('PATIENT DETAILS', 70, startY + 10);

            // Patient Details
            if (medicalRecord.patientId) {
                doc.fillColor('#1e293b')
                    .fontSize(12)
                    .font('Helvetica-Bold')
                    .text(`${medicalRecord.patientId.firstName} ${medicalRecord.patientId.lastName}`, 70, startY + 45)
                    .fontSize(10)
                    .font('Helvetica')
                    .text(`Patient ID: ${medicalRecord.patientId._id}`, 70, startY + 65)
                    .moveDown(0.5);

                // Add more patient details if available
                if (medicalRecord.patientId.dateOfBirth) {
                    doc.text(`DOB: ${new Date(medicalRecord.patientId.dateOfBirth).toLocaleDateString()}`, 70, startY + 85);
                }
            }

            // Doctor Card - Right side
            doc.roundedRect(315, startY, 230, 120, 8)
               .fillAndStroke('#f8fafc', '#e2e8f0');

            // Doctor Header with accent color
            doc.rect(315, startY, 230, 35, 8)
               .fill('#2563eb');

            doc.fontSize(16)
               .font('Helvetica-Bold')
               .fillColor('white')
               .text('PHYSICIAN DETAILS', 335, startY + 10);

            // Doctor Details
            if (medicalRecord.doctorId) {
                doc.fillColor('#1e293b')
                    .fontSize(12)
                    .font('Helvetica-Bold')
                    .text(`Dr. ${medicalRecord.doctorId.firstName} ${medicalRecord.doctorId.lastName}`, 335, startY + 45)
                    .fontSize(10)
                    .font('Helvetica');

                if (medicalRecord.doctorId.specialization) {
                    doc.text(`Specialization: ${medicalRecord.doctorId.specialization}`, 335, startY + 65);
                }

                if (medicalRecord.doctorId.licenseNumber) {
                    doc.text(`License No: ${medicalRecord.doctorId.licenseNumber}`, 335, startY + 85);
                }
            }

            // Appointment Details - Below both cards
            const appointmentY = startY + 135;
            if (medicalRecord.appointmentId && medicalRecord.appointmentId.dateTime) {
                doc.roundedRect(50, appointmentY, 495, 50, 8)
                   .fillAndStroke('#f0f9ff', '#93c5fd');

                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .fillColor('#1e40af')
                   .text('APPOINTMENT DETAILS', 70, appointmentY + 10);

                doc.fontSize(10)
                   .font('Helvetica')
                   .fillColor('#1e293b')
                   .text(`Date: ${new Date(medicalRecord.appointmentId.dateTime).toLocaleDateString()}`, 70, appointmentY + 28)
                   .text(`Time: ${new Date(medicalRecord.appointmentId.dateTime).toLocaleTimeString()}`, 300, appointmentY + 28);
            }

            // Update the Y position for next section
            doc.y = appointmentY + 70;

            // Sections Helper Function
            const addSection = (title, content) => {
                checkPageBreak(doc);
                const sectionY = doc.y;

                // Section Header
                doc.roundedRect(50, sectionY, 495, 35, 5)
                   .fillAndStroke('#2563eb', '#2563eb');
                
                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .fillColor('white')
                   .text(title, 65, sectionY + 10);

                doc.fillColor('black');
                doc.y = sectionY + 45;

                // Content
                if (typeof content === 'function') {
                    content();
                } else {
                    doc.fontSize(11)
                       .font('Helvetica')
                       .text(content, 65, doc.y, { width: 465 });
                }

                doc.moveDown(2);
            };

            // Diagnosis Section
            addSection('DIAGNOSIS', medicalRecord.diagnosis);

            // Clinical Notes
            addSection('CLINICAL NOTES', medicalRecord.notes);

            // Prescriptions Section
            addSection('PRESCRIPTIONS', () => {
                console.log('Prescriptions:', medicalRecord.prescriptions); // Debug log

                if (!medicalRecord.prescriptions || medicalRecord.prescriptions.length === 0) {
                    doc.fontSize(11)
                       .font('Helvetica')
                       .text('No prescriptions provided.');
                    return;
                }

                // Table Header
                const tableTop = doc.y;
                doc.fontSize(10)
                   .font('Helvetica-Bold');

                // Header background
                doc.rect(65, tableTop, 465, 25)
                   .fill('#f1f5f9');

                // Header text
                doc.fillColor('#1e293b')
                   .text('Medication', 80, tableTop + 8, { width: 120 })
                   .text('Dosage', 200, tableTop + 8, { width: 80 })
                   .text('Frequency', 280, tableTop + 8, { width: 100 })
                   .text('Duration', 380, tableTop + 8, { width: 80 });

                doc.y = tableTop + 35;

                // Prescription Items
                medicalRecord.prescriptions.forEach((prescription, index) => {
                    const startY = doc.y;

                    // Check if we need a new page
                    if (startY + 80 > doc.page.height - 50) {
                        doc.addPage();
                        doc.y = 50;
                        
                        // Repeat header on new page
                        doc.fontSize(14)
                           .font('Helvetica-Bold')
                           .text('PRESCRIPTIONS (continued)', 65, doc.y);
                        doc.moveDown();
                        
                        // Repeat table header
                        const newTableTop = doc.y;
                        doc.rect(65, newTableTop, 465, 25)
                           .fill('#f1f5f9');
                        
                        doc.fontSize(10)
                           .fillColor('#1e293b')
                           .text('Medication', 80, newTableTop + 8, { width: 120 })
                           .text('Dosage', 200, newTableTop + 8, { width: 80 })
                           .text('Frequency', 280, newTableTop + 8, { width: 100 })
                           .text('Duration', 380, newTableTop + 8, { width: 80 });
                        
                        doc.y = newTableTop + 35;
                    }

                    // Prescription card
                    const itemY = doc.y;
                    doc.roundedRect(65, itemY, 465, 70, 5)
                       .fillAndStroke('white', '#e2e8f0');

                    // Medicine name
                    doc.fontSize(11)
                       .font('Helvetica-Bold')
                       .fillColor('#1e293b')
                       .text(prescription.medicine, 80, itemY + 10, { width: 120 });

                    // Details
                    doc.fontSize(10)
                       .font('Helvetica')
                       .text(prescription.dosage, 200, itemY + 10, { width: 80 })
                       .text(prescription.frequency, 280, itemY + 10, { width: 100 })
                       .text(prescription.duration, 380, itemY + 10, { width: 80 });

                    // Instructions
                    doc.fontSize(9)
                       .fillColor('#4b5563')
                       .text('Instructions:', 80, itemY + 35)
                       .font('Helvetica')
                       .text(prescription.instructions, 80, itemY + 45, { width: 435 });

                    // Prepare for next item
                    doc.y = itemY + 80;
                });

                // Add some spacing after prescriptions
                doc.moveDown(2);
            });

            // Test Results Section
            addSection('TEST RESULTS', () => {
                const tests = medicalRecord.testResults;
                if (!tests.length) {
                    doc.text('No test results available.');
                    return;
                }

                tests.forEach((test, index) => {
                    if (checkPageBreak(doc)) {
                        doc.fontSize(14)
                           .font('Helvetica-Bold')
                           .text('TEST RESULTS (continued)', 65, doc.y);
                        doc.moveDown();
                    }

                    const testY = doc.y;
                    const isNormal = test.remarks?.toLowerCase().includes('normal');
                    
                    // Test Result Card
                    doc.roundedRect(65, testY, 465, 90, 5)
                       .fillAndStroke('white', '#e2e8f0');
                    
                    // Status indicator
                    doc.rect(65, testY, 8, 90)
                       .fill(isNormal ? '#22c55e' : '#ef4444');

                    // Test details
                    doc.fontSize(12)
                       .font('Helvetica-Bold')
                       .text(test.testName, 85, testY + 15);

                    doc.fontSize(10)
                       .font('Helvetica')
                       .text(`Result: ${test.result}`, 85, testY + 35)
                       .text(`Normal Range: ${test.normalRange}`, 285, testY + 35)
                       .text(`Date: ${new Date(test.date).toLocaleDateString()}`, 85, testY + 55)
                       .text(`Remarks: ${test.remarks}`, 85, testY + 70);

                    doc.y = testY + 100;
                });
            });

            // First, modify the Next Visit Section to use the exact UTC format
            // Next Visit Section - Small Blue Box
            const nextVisitY = doc.y + 10;
            doc.roundedRect(50, nextVisitY, 495, 45, 5)
               .fill('#2563eb');

            // Use the current UTC date format and add 7 days
            const currentDate = new Date('2025-03-23 11:40:16'); // Using your current UTC time
            const nextVisitDate = new Date(currentDate);
            nextVisitDate.setDate(nextVisitDate.getDate() + 7);
            
            // Format date in UTC YYYY-MM-DD HH:MM:SS
            const formattedDate = nextVisitDate.toISOString()
                .replace('T', ' ')
                .slice(0, 19);

            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor('white')
               .text('NEXT VISIT', 65, nextVisitY + 8)
               .fontSize(10)
               .font('Helvetica')
               .text(`Scheduled Date: ${formattedDate} UTC`, 65, nextVisitY + 25);

            // Move cursor down after next visit section
            doc.y = nextVisitY + 55;

            // Now fix the page numbers and footer to be consistent across all pages
            const addPageNumbersAndFooter = () => {
                const pages = doc.bufferedPageRange();
                for (let i = 0; i < pages.count; i++) {
                    doc.switchToPage(i);
                    
                    // Save the current Y position
                    const originalY = doc.y;
                    
                    // Draw footer background
                    doc.rect(0, doc.page.height - 60, doc.page.width, 60)
                       .fill('#f8fafc');
                    
                    // Page numbers
                    doc.fontSize(8)
                       .fillColor('#6b7280')
                       .text(
                           `Page ${i + 1} of ${pages.count}`,
                           0,
                           doc.page.height - 40,
                           { align: 'center' }
                       );

                    // Footer with current user and timestamp
                    doc.fontSize(7)
                       .fillColor('#6b7280')
                       .text(
                           `Generated on: ${currentDate.toISOString().replace('T', ' ').slice(0, 19)} UTC | Generated by: ${medicalRecord.currentUser || 'J33WAKASUPUN'}`,
                           0,
                           doc.page.height - 25,
                           { align: 'center' }
                       );
                    
                    // Restore the Y position
                    doc.y = originalY;
                }
            };

            // Add the page numbers and footer after all content is added
            addPageNumbersAndFooter();
            
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