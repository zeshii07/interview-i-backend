const PDFDocument = require('pdfkit');
const { PassThrough } = require('stream');

const COLORS = {
  ink: '#292929',
  body: '#414141',
  muted: '#727272',
  blue: '#3567F0',
  chip: '#EEF3FF',
  rule: '#292929',
  lightRule: '#C8C8C8',
};

const TEMPLATES = {
  'ats-classic': { ...COLORS, id: 'ats-classic', headingStyle: 'classic', headerStyle: 'left' },
  'corporate-professional': { ...COLORS, id: 'corporate-professional', ink: '#182433', body: '#263442', muted: '#617080', blue: '#17365D', chip: '#EAF0F7', rule: '#17365D', lightRule: '#B7C4D0', headingStyle: 'band', headerStyle: 'center' },
  'european-standard': { ...COLORS, id: 'european-standard', ink: '#18354A', body: '#304A5D', muted: '#687F8E', blue: '#005B96', chip: '#E8F3F9', rule: '#005B96', lightRule: '#B5D1E1', headingStyle: 'european', headerStyle: 'european' },
  'technical-compact': { ...COLORS, id: 'technical-compact', ink: '#193B38', body: '#2E4946', muted: '#687C79', blue: '#0F766E', chip: '#E5F4F1', rule: '#0F766E', lightRule: '#B5D8D3', headingStyle: 'technical', headerStyle: 'technical' },
  'eu-academic': { ...COLORS, id: 'eu-academic', ink: '#1A2A4F', body: '#2C3E50', muted: '#7B8794', blue: '#1A2A4F', chip: '#E8EEF7', rule: '#1A2A4F', lightRule: '#C5CFDD', headingStyle: 'academic', headerStyle: 'academic' },
  'academic-photo': { ...COLORS, id: 'academic-photo', ink: '#1A2A4F', body: '#2C3E50', muted: '#7B8794', blue: '#1A2A4F', chip: '#E8EEF7', rule: '#1A2A4F', lightRule: '#C5CFDD', headingStyle: 'academic', headerStyle: 'academic-photo' },
};

function getTheme(doc) {
  return doc.resumeTheme || TEMPLATES['ats-classic'];
}

function safeText(value, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function createSafeFilename(firstName, lastName) {
  const fullName = `${firstName}_${lastName}`
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  return `${fullName || 'Hirely_Candidate'}_Resume.pdf`;
}

function pageBottom(doc) {
  return doc.page.height - doc.page.margins.bottom - 18;
}

function ensureSpace(doc, height) {
  if (doc.y + height > pageBottom(doc)) doc.addPage();
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function addSectionHeading(doc, title) {
  ensureSpace(doc, 44);
  doc.moveDown(0.65);
  const y = doc.y;
  const theme = getTheme(doc);
  if (theme.headingStyle === 'band') {
    doc.roundedRect(doc.page.margins.left, y - 3, contentWidth(doc), 22, 2).fillColor(theme.blue).fill();
  } else if (theme.headingStyle === 'technical') {
    doc.rect(doc.page.margins.left, y - 3, 5, 22).fillColor(theme.blue).fill();
    doc.rect(doc.page.margins.left + 5, y - 3, contentWidth(doc) - 5, 22).fillColor(theme.chip).fill();
  }
  doc
    .font('Helvetica-Bold')
    .fontSize(theme.headingStyle === 'academic' ? 11.5 : 14)
    .fillColor(theme.headingStyle === 'band' ? '#FFFFFF' : theme.headingStyle === 'academic' ? theme.blue : theme.ink)
    .text(safeText(title).toUpperCase(), doc.page.margins.left + (theme.headingStyle === 'technical' ? 13 : theme.headingStyle === 'band' ? 10 : 0), y, {
      width: contentWidth(doc) - (theme.headingStyle === 'technical' ? 13 : theme.headingStyle === 'band' ? 20 : 0),
      lineBreak: false,
    });

  const lineY = y + 18;
  if (theme.headingStyle === 'band' || theme.headingStyle === 'technical') {
    doc.y = lineY + 8;
    return;
  }
  doc
    .moveTo(doc.page.margins.left, lineY)
    .lineTo(doc.page.width - doc.page.margins.right, lineY)
    .lineWidth(theme.headingStyle === 'european' ? 1 : theme.headingStyle === 'academic' ? 0.75 : 1.5)
    .strokeColor(theme.rule)
    .stroke();
  doc.y = lineY + 8;
}

function addParagraph(doc, value, options = {}) {
  const text = safeText(value);
  if (!text) return;
  const width = options.width || contentWidth(doc);
  doc.font('Helvetica').fontSize(options.size || 9.5);
  const height = doc.heightOfString(text, { width, lineGap: 1.2 });
  ensureSpace(doc, height + 4);
  doc.fillColor(options.color || getTheme(doc).body).text(text, {
    width,
    lineGap: 1.2,
    align: options.align || 'left',
  });
}

function addBulletPoint(doc, value) {
  const text = safeText(value);
  if (!text) return;
  const left = doc.page.margins.left;
  const textX = left + 12;
  const width = contentWidth(doc) - 12;
  doc.font('Helvetica').fontSize(9.5);
  const height = doc.heightOfString(text, { width, lineGap: 1.1 });
  ensureSpace(doc, height + 3);
  const y = doc.y;
  doc.circle(left + 3, y + 5, 1.35).fillColor(getTheme(doc).body).fill();
  doc.fillColor(getTheme(doc).body).text(text, textX, y, { width, lineGap: 1.1 });
  doc.y = y + height + 2;
}

function drawContactIcon(doc, type, x, y) {
  const theme = getTheme(doc);
  doc.save().strokeColor(theme.blue).fillColor(theme.blue).lineWidth(0.8);
  if (type === 'email') {
    doc.roundedRect(x, y + 1, 9, 7, 1).stroke();
    doc.moveTo(x, y + 1).lineTo(x + 4.5, y + 5).lineTo(x + 9, y + 1).stroke();
  } else if (type === 'phone') {
    doc.arc(x + 4.5, y + 4.5, 3.7, 115, 245).stroke();
    doc.circle(x + 1.2, y + 7.2, 1).fill();
    doc.circle(x + 7.8, y + 1.8, 1).fill();
  } else if (type === 'location') {
    doc.circle(x + 4.5, y + 3.5, 3.3).stroke();
    doc.circle(x + 4.5, y + 3.5, 1.1).stroke();
    doc.moveTo(x + 2.2, y + 6).lineTo(x + 4.5, y + 9).lineTo(x + 6.8, y + 6).stroke();
  } else if (type === 'linkedin') {
    doc.roundedRect(x, y, 9, 9, 1).fill();
    doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#FFFFFF').text('in', x + 1.6, y + 1.8, { lineBreak: false });
  } else if (type === 'github') {
    doc.circle(x + 4.5, y + 4.5, 4.2).stroke();
    doc.font('Helvetica-Bold').fontSize(4.5).fillColor(theme.blue).text('GH', x + 1.1, y + 2.1, { lineBreak: false });
  } else {
    doc.circle(x + 3, y + 4.5, 2.5).stroke();
    doc.circle(x + 7, y + 4.5, 2.5).stroke();
    doc.moveTo(x + 3.5, y + 4.5).lineTo(x + 6.5, y + 4.5).stroke();
  }
  doc.restore();
}

function addContactRows(doc, items) {
  if (!items.length) return;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  let x = left;
  let y = doc.y;

  // Each icon is 9pt wide + ~11pt spacing = 20pt slot. No text labels.
  const slotWidth = 20;

  items.forEach((item) => {
    if (x + slotWidth > right) {
      x = left;
      y += 17;
    }
    drawContactIcon(doc, item.type, x, y + 1);

    // Add a clickable link annotation over the icon area so tapping the icon
    // opens the email/phone/URL. The annotation is invisible (no border).
    if (item.link) {
      doc.link(x, y, slotWidth, 11, item.link);
    }
    x += slotWidth;
  });
  doc.y = y + 15;
}

function addHeadingRow(doc, leftText, rightText) {
  ensureSpace(doc, 24);
  const y = doc.y;
  const width = contentWidth(doc);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(getTheme(doc).body);
  doc.text(leftText, doc.page.margins.left, y, { width: width * 0.72, lineBreak: false });
  if (rightText) {
    doc.text(rightText, doc.page.margins.left + width * 0.72, y, {
      width: width * 0.28,
      align: 'right',
      lineBreak: false,
    });
  }
  doc.y = y + 14;
}

function addSubheadingRow(doc, leftText, rightText) {
  const y = doc.y;
  const width = contentWidth(doc);
  if (leftText) {
    doc.font('Helvetica-Bold').fontSize(9.2).fillColor(getTheme(doc).blue).text(leftText, doc.page.margins.left, y, {
      width: width * 0.72,
      lineBreak: false,
    });
  }
  if (rightText) {
    doc.font('Helvetica').fontSize(8.8).fillColor(getTheme(doc).body).text(rightText, doc.page.margins.left + width * 0.72, y, {
      width: width * 0.28,
      align: 'right',
      lineBreak: false,
    });
  }
  doc.y = y + 13;
}

function addMetaRow(doc, leftText, rightText) {
  const y = doc.y;
  const width = contentWidth(doc);
  doc.font('Helvetica').fontSize(8.8).fillColor(getTheme(doc).body);
  if (leftText) {
    doc.text(leftText, doc.page.margins.left, y, {
      width: width * 0.65,
      lineBreak: false,
    });
  }
  if (rightText) {
    doc.text(rightText, doc.page.margins.left + width * 0.65, y, {
      width: width * 0.35,
      align: 'right',
      lineBreak: false,
    });
  }
  doc.y = y + 13;
}

function addSkills(doc, skills) {
  const values = skills
    .map((skill) => (typeof skill === 'string' ? skill.trim() : safeText(skill?.name)))
    .filter(Boolean);
  if (!values.length) return;

  addSectionHeading(doc, 'Skills');
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  let x = left;
  let y = doc.y;

  values.forEach((skill) => {
    doc.font('Helvetica').fontSize(9);
    const width = Math.min(doc.widthOfString(skill) + 22, 150);
    if (x + width > right) {
      x = left;
      y += 24;
    }
    if (y + 21 > pageBottom(doc)) {
      doc.addPage();
      x = left;
      y = doc.y;
    }
    doc.roundedRect(x, y, width, 19, 3).fillColor(getTheme(doc).chip).fill();
    doc.fillColor(getTheme(doc).blue).text(skill, x + 11, y + 5, {
      width: width - 22,
      align: 'center',
      lineBreak: false,
    });
    x += width + 9;
  });
  doc.y = y + 20;
}

function addCustomSection(doc, section) {
  const title = safeText(section?.title);
  const content = safeText(section?.content);
  if (!title || !content) return;
  addSectionHeading(doc, title);
  const lines = content.split(/\r?\n/).map((line) => line.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
  if (lines.length > 1) lines.forEach((line) => addBulletPoint(doc, line));
  else addParagraph(doc, content);
}

// ---------- academic template helpers ----------

/**
 * Format education date range from start + end (year) fields.
 *   start=2020, end=2024 -> "2020 - 2024"
 *   start=2020, end=''   -> "2020 - Present"
 *   start='',   end=2024 -> "2024"
 *   start='',   end=''   -> ""
 */
function formatEducationDateRange(startDate, endDate) {
  const start = safeText(startDate);
  const end = safeText(endDate);
  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} - Present`;
  if (end) return end;
  return '';
}

function addAcademicPersonalDetails(doc, resumeData) {
  const parts = [
    safeText(resumeData.nationality) ? `Nationality: ${safeText(resumeData.nationality)}` : '',
    safeText(resumeData.dateOfBirth) ? `Date of birth: ${safeText(resumeData.dateOfBirth)}` : '',
    safeText(resumeData.placeOfBirth) ? `Place of birth: ${safeText(resumeData.placeOfBirth)}` : '',
  ].filter(Boolean);
  if (!parts.length) return;
  const theme = getTheme(doc);
  doc.font('Helvetica').fontSize(9).fillColor(theme.muted);
  doc.text(parts.join('   |   '), doc.page.margins.left, doc.y, {
    width: contentWidth(doc),
    align: 'center',
    lineGap: 1,
  });
  doc.moveDown(1.1);
}

function addLanguagesBlock(doc, languagesText) {
  const text = safeText(languagesText);
  if (!text) return;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return;
  addSectionHeading(doc, 'Languages');
  const theme = getTheme(doc);
  lines.forEach((line) => {
    doc.font('Helvetica').fontSize(9.5).fillColor(theme.body);
    const height = doc.heightOfString(`•  ${line}`, { width: contentWidth(doc), lineGap: 1.1 });
    ensureSpace(doc, height + 3);
    const y = doc.y;
    doc.circle(doc.page.margins.left + 3, y + 4.5, 1.35).fillColor(theme.body).fill();
    doc.fillColor(theme.body).text(`  ${line}`, doc.page.margins.left + 6, y, {
      width: contentWidth(doc) - 6,
      lineGap: 1.1,
    });
    doc.y = y + height + 2;
  });
  doc.moveDown(0.3);
}

function addReferencesBlock(doc, referencesText) {
  const text = safeText(referencesText);
  if (!text) return;
  addSectionHeading(doc, 'References');
  const theme = getTheme(doc);
  const trimmed = text.trim();
  if (/^available on request\.?$/i.test(trimmed)) {
    addParagraph(doc, 'Available on request.');
    return;
  }
  const blocks = trimmed.split(/\r?\n\s*\r?\n/).map((b) => b.trim()).filter(Boolean);
  blocks.forEach((block, idx) => {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    lines.forEach((line, lineIdx) => {
      if (lineIdx === 0) {
        doc.font('Helvetica-Bold').fontSize(9.8).fillColor(theme.ink);
      } else {
        doc.font('Helvetica').fontSize(9.2).fillColor(theme.body);
      }
      const height = doc.heightOfString(line, { width: contentWidth(doc), lineGap: 1.1 });
      ensureSpace(doc, height + 3);
      doc.fillColor(lineIdx === 0 ? theme.ink : theme.body).text(line, {
        width: contentWidth(doc),
        lineGap: 1.1,
      });
    });
    if (idx < blocks.length - 1) doc.moveDown(0.4);
  });
}

// The Europass/DAAD-style signature footer ("Place, Date" + signature line)
// was previously rendered here but has been removed at the user's request.
// The EU Academic template now ends with the References block, with no extra
// signature/date footer on any page.

function generateResumePdf(resumeData = {}) {
  if (!resumeData || typeof resumeData !== 'object' || Array.isArray(resumeData)) {
    throw new TypeError('Resume data must be an object.');
  }

  const firstName = safeText(resumeData.firstName, 'Candidate');
  const lastName = safeText(resumeData.lastName, 'User');
  const fullName = `${firstName} ${lastName}`.trim();
  const targetRole = safeText(resumeData.targetRole);
  const templateId = TEMPLATES[resumeData.templateId] ? resumeData.templateId : 'ats-classic';
  const theme = TEMPLATES[templateId];
  const outputStream = new PassThrough();
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 30, bottom: 38, left: 32, right: 32 },
    bufferPages: true,
    info: {
      Title: `${fullName} - Resume`,
      Author: fullName,
      Subject: 'ATS-optimized resume generated by Hirely AI',
      Creator: 'Hirely AI',
    },
  });
  doc.resumeTheme = theme;

  doc.pipe(outputStream);
  if (theme.headerStyle === 'academic-photo') {
    // DAAD-style header: portrait photo top-right, name+target on left
    const photoSize = 90; // width in pt; 4:5 portrait => height = 112.5
    const photoW = photoSize;
    const photoH = photoSize * 1.25;
    const photoX = doc.page.width - doc.page.margins.right - photoW;
    const photoY = doc.y;
    const leftTextWidth = photoX - doc.page.margins.left - 14;

    // Try to embed the photo from base64 data; if missing or invalid, draw
    // an initials avatar in a colored rectangle as fallback.
    const photoBase64 = safeText(resumeData.photoBase64);
    const photoMime = safeText(resumeData.photoMimeType) || 'image/jpeg';
    let photoEmbedded = false;
    if (photoBase64) {
      try {
        const buffer = Buffer.from(photoBase64, 'base64');
        doc.image(buffer, photoX, photoY, { width: photoW, height: photoH });
        photoEmbedded = true;
      } catch (err) {
        console.warn('Failed to embed photo:', err.message);
      }
    }
    if (!photoEmbedded) {
      // Initials avatar fallback
      const initials = `${safeText(resumeData.firstName, 'A').charAt(0)}${safeText(resumeData.lastName, 'U').charAt(0)}`.toUpperCase();
      doc.save().fillColor(theme.chip).rect(photoX, photoY, photoW, photoH).fill().restore();
      doc.save().strokeColor(theme.rule).lineWidth(0.75).rect(photoX, photoY, photoW, photoH).stroke().restore();
      doc.font('Helvetica-Bold').fontSize(34).fillColor(theme.blue).text(initials, photoX, photoY + photoH / 2 - 17, { width: photoW, align: 'center' });
    }

    // Name + target role on the left side of the photo
    const nameY = photoY + 8;
    doc.font('Helvetica-Bold').fontSize(22).fillColor(theme.ink).text(fullName, doc.page.margins.left, nameY, { width: leftTextWidth, align: 'left' });
    if (targetRole) {
      doc.font('Helvetica').fontSize(11).fillColor(theme.blue).text(targetRole, doc.page.margins.left, nameY + 30, { width: leftTextWidth, align: 'left' });
    }

    // Move cursor below the photo
    doc.y = photoY + photoH + 8;

    // Thin centered rule under the header
    const ruleY = doc.y;
    doc
      .moveTo(doc.page.margins.left + 80, ruleY)
      .lineTo(doc.page.width - doc.page.margins.right - 80, ruleY)
      .lineWidth(0.75)
      .strokeColor(theme.rule)
      .stroke();
    doc.moveDown(0.4);
    addAcademicPersonalDetails(doc, resumeData);
  } else if (theme.headerStyle === 'academic') {
    // Europass-inspired centered header
    doc.font('Helvetica-Bold').fontSize(22).fillColor(theme.ink).text(fullName, { align: 'center' });
    if (targetRole) {
      doc.font('Helvetica').fontSize(11).fillColor(theme.blue).text(targetRole, { align: 'center' });
    }
    doc.moveDown(0.3);
    const ruleY = doc.y;
    doc
      .moveTo(doc.page.margins.left + 80, ruleY)
      .lineTo(doc.page.width - doc.page.margins.right - 80, ruleY)
      .lineWidth(0.75)
      .strokeColor(theme.rule)
      .stroke();
    doc.moveDown(0.4);
    addAcademicPersonalDetails(doc, resumeData);
  } else if (theme.headerStyle === 'european') {
    const headerY = doc.y;
    doc.roundedRect(doc.page.margins.left, headerY, contentWidth(doc), 55, 3).fillColor(theme.blue).fill();
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#FFFFFF').text(fullName, doc.page.margins.left + 15, headerY + 10, { width: contentWidth(doc) - 30 });
    if (targetRole) doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#DDEEF8').text(targetRole, doc.page.margins.left + 15, headerY + 36, { width: contentWidth(doc) - 30 });
    doc.y = headerY + 64;
  } else {
    const centered = theme.headerStyle === 'center';
    doc.font('Helvetica-Bold').fontSize(theme.headerStyle === 'technical' ? 23 : 25).fillColor(theme.ink).text(fullName, { align: centered ? 'center' : 'left' });
    if (targetRole) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(theme.blue).text(targetRole, { align: centered ? 'center' : 'left' });
    }
    if (theme.headerStyle === 'technical') {
      doc.moveDown(0.25).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).lineWidth(3).strokeColor(theme.blue).stroke();
      doc.moveDown(0.3);
    }
  }

  const contactItems = [
    { type: 'email', label: safeText(resumeData.email), link: `mailto:${safeText(resumeData.email)}` },
    { type: 'phone', label: safeText(resumeData.phone), link: `tel:${safeText(resumeData.phone)}` },
    { type: 'linkedin', label: safeText(resumeData.linkedin), link: safeText(resumeData.linkedin) },
    { type: 'github', label: safeText(resumeData.github), link: safeText(resumeData.github) },
    { type: 'portfolio', label: safeText(resumeData.portfolio), link: safeText(resumeData.portfolio) },
    { type: 'location', label: safeText(resumeData.location) },
  ].filter((item) => item.label);
  addContactRows(doc, contactItems);

  const summary = safeText(resumeData.summary);
  if (summary) {
    addSectionHeading(doc, (templateId === 'eu-academic' || templateId === 'academic-photo') ? 'Personal Statement' : 'Summary');
    addParagraph(doc, summary);
  }

  if (templateId === 'eu-academic' || templateId === 'academic-photo') {
    // ===========================================================
    // EU ACADEMIC — Europass-style section order
    // (Education first, then projects, experience, skills,
    //  languages, certifications, custom sections, references,
    //  signature footer)
    // ===========================================================
    const education = safeArray(resumeData.education);
    if (education.length) {
      addSectionHeading(doc, 'Education');
      education.forEach((item, index) => {
        // Line 1: degree (left) + gpa (right)
        addHeadingRow(doc, safeText(item?.degree, 'Qualification'), safeText(item?.gpa));
        // Line 2: institution (left) + date range (right)
        const dateRange = formatEducationDateRange(item?.startDate, item?.year);
        if (item?.institution || dateRange) {
          addSubheadingRow(doc, safeText(item?.institution), dateRange);
        }
        // Line 3: location
        if (item?.location) {
          addMetaRow(doc, safeText(item?.location), '');
        }
        if (index < education.length - 1) doc.moveDown(0.35);
      });
    }

    const projects = safeArray(resumeData.projects);
    if (projects.length) {
      addSectionHeading(doc, 'Research & Academic Projects');
      projects.forEach((project, index) => {
        const projectText =
          safeArray(project?.points).filter(Boolean).join(' ') ||
          safeText(project?.description);
        doc.font('Helvetica').fontSize(9.3);
        const projectHeight = doc.heightOfString(projectText, { width: contentWidth(doc), lineGap: 1.2 });
        if (doc.y + projectHeight + 43 > pageBottom(doc)) {
          doc.addPage();
          addSectionHeading(doc, 'Research & Academic Projects (continued)');
        }
        addHeadingRow(doc, safeText(project?.name, 'Project'), '');
        const technologies = Array.isArray(project?.technologies)
          ? project.technologies.filter(Boolean).join(', ')
          : safeText(project?.technologies);
        if (technologies) {
          doc.font('Helvetica').fontSize(8.5).fillColor(theme.muted).text(
            technologies,
            doc.page.margins.left,
            doc.y,
            { width: contentWidth(doc) }
          );
        }
        const points = safeArray(project?.points).filter(Boolean);
        if (points.length) points.forEach((point) => addBulletPoint(doc, point));
        else addParagraph(doc, project?.description, { size: 9.3 });
        if (index < projects.length - 1) {
          doc.moveDown(0.3);
          doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).dash(2, { space: 2 }).strokeColor(theme.lightRule).stroke().undash();
          doc.moveDown(0.3);
        }
      });
    }

    const experience = safeArray(resumeData.experience);
    if (experience.length) {
      addSectionHeading(doc, 'Work & Internship Experience');
      experience.forEach((item, index) => {
        ensureSpace(doc, 58);
        addHeadingRow(doc, safeText(item?.role, 'Position'), safeText(item?.duration));
        addSubheadingRow(doc, safeText(item?.company), safeText(item?.location));
        safeArray(item?.points).forEach((point) => addBulletPoint(doc, point));
        if (index < experience.length - 1) doc.moveDown(0.35);
      });
    }

    addSkills(doc, safeArray(resumeData.skills));

    addLanguagesBlock(doc, resumeData.languagesText);

    const certifications = safeArray(resumeData.certifications);
    if (certifications.length) {
      addSectionHeading(doc, 'Certifications & Awards');
      certifications.forEach((item, index) => {
        const certification = typeof item === 'string' ? { name: item } : item;
        ensureSpace(doc, 34);
        addHeadingRow(doc, safeText(certification?.name), safeText(certification?.year));
        if (certification?.issuer) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor(theme.blue).text(
            safeText(certification.issuer),
            doc.page.margins.left,
            doc.y,
            { width: contentWidth(doc) }
          );
        }
        if (index < certifications.length - 1) doc.moveDown(0.25);
      });
    }

    safeArray(resumeData.customSections).forEach((section) => addCustomSection(doc, section));

    addReferencesBlock(doc, resumeData.referencesText);
  } else {
    // ===========================================================
    // Standard templates — original section order
    // ===========================================================
    if (templateId === 'technical-compact') {
      addSkills(doc, safeArray(resumeData.skills));
    }

    const education = safeArray(resumeData.education);
    if (education.length) {
      addSectionHeading(doc, 'Education');
      education.forEach((item, index) => {
        // Line 1: degree (left) + gpa (right)
        addHeadingRow(doc, safeText(item?.degree, 'Qualification'), safeText(item?.gpa));
        // Line 2: institution (left) + date range (right)
        const dateRange = formatEducationDateRange(item?.startDate, item?.year);
        if (item?.institution || dateRange) {
          addSubheadingRow(doc, safeText(item?.institution), dateRange);
        }
        // Line 3: location
        if (item?.location) {
          addMetaRow(doc, safeText(item?.location), '');
        }
        if (index < education.length - 1) doc.moveDown(0.35);
      });
    }

    const experience = safeArray(resumeData.experience);
    if (experience.length) {
      addSectionHeading(doc, 'Experience');
      experience.forEach((item, index) => {
        ensureSpace(doc, 58);
        addHeadingRow(doc, safeText(item?.role, 'Position'), safeText(item?.duration));
        addSubheadingRow(doc, safeText(item?.company), safeText(item?.location));
        safeArray(item?.points).forEach((point) => addBulletPoint(doc, point));
        if (index < experience.length - 1) doc.moveDown(0.35);
      });
    }

    const projects = safeArray(resumeData.projects);
    if (projects.length) {
      addSectionHeading(doc, 'Projects');
      projects.forEach((project, index) => {
        const projectText =
          safeArray(project?.points).filter(Boolean).join(' ') ||
          safeText(project?.description);
        doc.font('Helvetica').fontSize(9.3);
        const projectHeight = doc.heightOfString(projectText, {
          width: contentWidth(doc),
          lineGap: 1.2,
        });
        if (doc.y + projectHeight + 43 > pageBottom(doc)) {
          doc.addPage();
          addSectionHeading(doc, 'Projects (continued)');
        }
        addHeadingRow(doc, safeText(project?.name, 'Project'), '');
        const technologies = Array.isArray(project?.technologies)
          ? project.technologies.filter(Boolean).join(', ')
          : safeText(project?.technologies);
        if (technologies) {
          doc.font('Helvetica').fontSize(8.5).fillColor(theme.muted).text(
            technologies,
            doc.page.margins.left,
            doc.y,
            { width: contentWidth(doc) }
          );
        }
        const points = safeArray(project?.points).filter(Boolean);
        if (points.length) points.forEach((point) => addBulletPoint(doc, point));
        else addParagraph(doc, project?.description, { size: 9.3 });
        if (index < projects.length - 1) {
          doc.moveDown(0.3);
          doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).dash(2, { space: 2 }).strokeColor(theme.lightRule).stroke().undash();
          doc.moveDown(0.3);
        }
      });
    }

    if (templateId !== 'technical-compact') {
      addSkills(doc, safeArray(resumeData.skills));
    }

    const certifications = safeArray(resumeData.certifications);
    if (certifications.length) {
      addSectionHeading(doc, 'Certifications');
      certifications.forEach((item, index) => {
        const certification = typeof item === 'string' ? { name: item } : item;
        ensureSpace(doc, 34);
        addHeadingRow(doc, safeText(certification?.name), safeText(certification?.year));
        if (certification?.issuer) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor(theme.blue).text(
            safeText(certification.issuer),
            doc.page.margins.left,
            doc.y,
            { width: contentWidth(doc) }
          );
        }
        if (index < certifications.length - 1) doc.moveDown(0.25);
      });
    }

    safeArray(resumeData.customSections).forEach((section) => addCustomSection(doc, section));
  } // end of non-academic branch

  const pages = doc.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index += 1) {
    doc.switchToPage(index);
    doc.font('Helvetica').fontSize(7.5).fillColor('#999999').text(
      `${fullName} | Page ${index + 1} of ${pages.count}`,
      doc.page.margins.left,
      pageBottom(doc) + 5,
      { width: contentWidth(doc), align: 'center', lineBreak: false }
    );
  }

  doc.end();
  return { stream: outputStream, filename: createSafeFilename(firstName, lastName) };
}

module.exports = { generateResumePdf };
