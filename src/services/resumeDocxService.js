/**
 * Resume DOCX generator — produces a real .docx file using the `docx` library.
 *
 * Supports all 5 templates (ats-classic, corporate-professional, european-standard,
 * technical-compact, eu-academic) with consistent visual styling that mirrors
 * the PDF output as closely as .docx allows.
 *
 * The .docx format is structured (paragraphs + runs with formatting), so we
 * translate the same section order used by resumePdfService.js into a sequence
 * of Paragraph / TextRun / Table elements.
 */

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  LevelFormat,
  convertInchesToTwip,
  PageOrientation,
} = require('docx');

// ---------- helpers ----------

function cleanText(value, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

// Map a hex color like "#1A2A4F" to the "RRGGBB" form expected by docx (no #)
function hexToDocx(hex) {
  const cleaned = String(hex || '').replace('#', '').trim();
  if (!/^([0-9a-fA-F]{6})$/.test(cleaned)) return '222222';
  return cleaned.toUpperCase();
}

const TEMPLATE_THEMES = {
  'ats-classic': {
    ink: '292929', body: '414141', muted: '727272', accent: '3567F0', chip: 'EEF3FF', rule: '292929',
    headerAlign: AlignmentType.LEFT,
  },
  'corporate-professional': {
    ink: '182433', body: '263442', muted: '617080', accent: '17365D', chip: 'EAF0F7', rule: '17365D',
    headerAlign: AlignmentType.CENTER,
  },
  'european-standard': {
    ink: '18354A', body: '304A5D', muted: '687F8E', accent: '005B96', chip: 'E8F3F9', rule: '005B96',
    headerAlign: AlignmentType.LEFT,
  },
  'technical-compact': {
    ink: '193B38', body: '2E4946', muted: '687C79', accent: '0F766E', chip: 'E5F4F1', rule: '0F766E',
    headerAlign: AlignmentType.LEFT,
  },
  'eu-academic': {
    ink: '1A2A4F', body: '2C3E50', muted: '7B8794', accent: '1A2A4F', chip: 'E8EEF7', rule: '1A2A4F',
    headerAlign: AlignmentType.CENTER,
  },
};

function getTheme(templateId) {
  return TEMPLATE_THEMES[templateId] && TEMPLATE_THEMES[templateId].accent
    ? TEMPLATE_THEMES[templateId]
    : TEMPLATE_THEMES['ats-classic'];
}

// ---------- paragraph builders ----------

function sectionHeading(text, theme) {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    border: {
      bottom: {
        color: hexToDocx(theme.rule),
        space: 1,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    },
    children: [
      new TextRun({
        text: cleanText(text).toUpperCase(),
        bold: true,
        size: 24, // 12pt
        color: hexToDocx(theme.accent),
        font: 'Helvetica',
      }),
    ],
  });
}

function bodyParagraph(text, theme, options = {}) {
  return new Paragraph({
    spacing: { after: 80, line: 240 },
    alignment: options.align || AlignmentType.LEFT,
    children: [
      new TextRun({
        text: cleanText(text),
        size: 20, // 10pt
        color: hexToDocx(theme.body),
        font: 'Helvetica',
      }),
    ],
  });
}

function bulletParagraph(text, theme) {
  return new Paragraph({
    spacing: { after: 40, line: 240 },
    bullet: { level: 0 },
    children: [
      new TextRun({
        text: cleanText(text),
        size: 20,
        color: hexToDocx(theme.body),
        font: 'Helvetica',
      }),
    ],
  });
}

function headingRow(leftText, rightText, theme) {
  const children = [
    new TextRun({
      text: cleanText(leftText),
      bold: true,
      size: 22, // 11pt
      color: hexToDocx(theme.body),
      font: 'Helvetica',
    }),
  ];
  if (rightText) {
    children.push(new TextRun({
      text: '\t' + cleanText(rightText),
      bold: true,
      size: 22,
      color: hexToDocx(theme.body),
      font: 'Helvetica',
    }));
  }
  return new Paragraph({
    spacing: { after: 40, line: 240 },
    tabStops: [{ type: 'right', position: convertInchesToTwip(6.5) }],
    children,
  });
}

function subheadingRow(leftText, rightText, theme) {
  const children = [];
  if (leftText) {
    children.push(new TextRun({
      text: cleanText(leftText),
      bold: true,
      size: 19, // ~9.5pt
      color: hexToDocx(theme.accent),
      font: 'Helvetica',
    }));
  }
  if (rightText) {
    children.push(new TextRun({
      text: '\t' + cleanText(rightText),
      size: 18,
      color: hexToDocx(theme.body),
      font: 'Helvetica',
    }));
  }
  return new Paragraph({
    spacing: { after: 30, line: 220 },
    tabStops: [{ type: 'right', position: convertInchesToTwip(6.5) }],
    children,
  });
}

function metaRow(leftText, rightText, theme) {
  const children = [];
  if (leftText) {
    children.push(new TextRun({
      text: cleanText(leftText),
      size: 18,
      color: hexToDocx(theme.body),
      font: 'Helvetica',
    }));
  }
  if (rightText) {
    children.push(new TextRun({
      text: '\t' + cleanText(rightText),
      size: 18,
      color: hexToDocx(theme.body),
      font: 'Helvetica',
    }));
  }
  return new Paragraph({
    spacing: { after: 40, line: 220 },
    tabStops: [{ type: 'right', position: convertInchesToTwip(6.5) }],
    children,
  });
}

function emptyParagraph() {
  return new Paragraph({ spacing: { after: 40 }, children: [] });
}

// ---------- main entry ----------

async function generateResumeDocx(resumeData = {}) {
  if (!resumeData || typeof resumeData !== 'object' || Array.isArray(resumeData)) {
    throw new TypeError('Resume data must be an object.');
  }

  const firstName = cleanText(resumeData.firstName, 'Candidate');
  const lastName = cleanText(resumeData.lastName, 'User');
  const fullName = `${firstName} ${lastName}`.trim();
  const targetRole = cleanText(resumeData.targetRole);
  const templateId = getTheme(resumeData.templateId).accent
    ? resumeData.templateId
    : 'ats-classic';
  const theme = getTheme(templateId);

  const children = [];

  // --- header (name + target role) ---
  children.push(new Paragraph({
    alignment: theme.headerAlign,
    spacing: { after: 80 },
    children: [
      new TextRun({
        text: fullName,
        bold: true,
        size: 44, // 22pt
        color: hexToDocx(theme.ink),
        font: 'Helvetica',
      }),
    ],
  }));

  if (targetRole) {
    children.push(new Paragraph({
      alignment: theme.headerAlign,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: targetRole,
          bold: templateId === 'eu-academic',
          size: 22, // 11pt
          color: hexToDocx(theme.accent),
          font: 'Helvetica',
        }),
      ],
    }));
  }

  // academic personal details line
  if (templateId === 'eu-academic') {
    const parts = [
      cleanText(resumeData.nationality) ? `Nationality: ${cleanText(resumeData.nationality)}` : '',
      cleanText(resumeData.dateOfBirth) ? `Date of birth: ${cleanText(resumeData.dateOfBirth)}` : '',
      cleanText(resumeData.placeOfBirth) ? `Place of birth: ${cleanText(resumeData.placeOfBirth)}` : '',
    ].filter(Boolean);
    if (parts.length) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: parts.join('   |   '),
            size: 18,
            color: hexToDocx(theme.muted),
            font: 'Helvetica',
          }),
        ],
      }));
    }
  }

  // contact line
  const contactItems = [
    cleanText(resumeData.email),
    cleanText(resumeData.phone),
    cleanText(resumeData.location),
    cleanText(resumeData.linkedin),
    cleanText(resumeData.github),
    cleanText(resumeData.portfolio),
  ].filter(Boolean);
  if (contactItems.length) {
    children.push(new Paragraph({
      alignment: theme.headerAlign,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: contactItems.join('   |   '),
          size: 18,
          color: hexToDocx(theme.body),
          font: 'Helvetica',
        }),
      ],
    }));
  }

  // summary / personal statement
  const summary = cleanText(resumeData.summary);
  if (summary) {
    children.push(sectionHeading(
      templateId === 'eu-academic' ? 'Personal Statement' : 'Summary',
      theme
    ));
    children.push(bodyParagraph(summary, theme));
  }

  // ============================================================
  // EU ACADEMIC — Europass-style section order
  // ============================================================
  if (templateId === 'eu-academic') {
    const education = safeArray(resumeData.education);
    if (education.length) {
      children.push(sectionHeading('Education', theme));
      education.forEach((item) => {
        children.push(headingRow(
          cleanText(item?.degree, 'Qualification'),
          cleanText(item?.gpa) || cleanText(item?.year),
          theme
        ));
        if (item?.institution) {
          children.push(subheadingRow(cleanText(item?.institution), cleanText(item?.location), theme));
        }
        if (item?.gpa && item?.year) {
          children.push(metaRow(cleanText(item?.year), '', theme));
        }
      });
    }

    const projects = safeArray(resumeData.projects);
    if (projects.length) {
      children.push(sectionHeading('Research & Academic Projects', theme));
      projects.forEach((project) => {
        children.push(headingRow(cleanText(project?.name, 'Project'), '', theme));
        const technologies = Array.isArray(project?.technologies)
          ? project.technologies.filter(Boolean).join(', ')
          : cleanText(project?.technologies);
        if (technologies) {
          children.push(new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: technologies,
                size: 17,
                color: hexToDocx(theme.muted),
                font: 'Helvetica',
              }),
            ],
          }));
        }
        const points = safeArray(project?.points).filter(Boolean);
        if (points.length) {
          points.forEach((p) => children.push(bulletParagraph(p, theme)));
        } else if (project?.description) {
          children.push(bodyParagraph(project.description, theme));
        }
        children.push(emptyParagraph());
      });
    }

    const experience = safeArray(resumeData.experience);
    if (experience.length) {
      children.push(sectionHeading('Work & Internship Experience', theme));
      experience.forEach((item) => {
        children.push(headingRow(cleanText(item?.role, 'Position'), cleanText(item?.duration), theme));
        children.push(subheadingRow(cleanText(item?.company), cleanText(item?.location), theme));
        safeArray(item?.points).forEach((p) => children.push(bulletParagraph(p, theme)));
        children.push(emptyParagraph());
      });
    }

    // Skills as comma-separated list
    const skills = safeArray(resumeData.skills)
      .map((s) => (typeof s === 'string' ? s.trim() : cleanText(s?.name)))
      .filter(Boolean);
    if (skills.length) {
      children.push(sectionHeading('Skills', theme));
      children.push(bodyParagraph(skills.join('  ·  '), theme));
    }

    // Languages
    const languagesText = cleanText(resumeData.languagesText);
    if (languagesText) {
      children.push(sectionHeading('Languages', theme));
      languagesText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((line) => children.push(bulletParagraph(line, theme)));
    }

    // Certifications & Awards
    const certifications = safeArray(resumeData.certifications);
    if (certifications.length) {
      children.push(sectionHeading('Certifications & Awards', theme));
      certifications.forEach((item) => {
        const cert = typeof item === 'string' ? { name: item } : item;
        children.push(headingRow(cleanText(cert?.name), cleanText(cert?.year), theme));
        if (cert?.issuer) {
          children.push(new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: cleanText(cert.issuer),
                bold: true,
                size: 18,
                color: hexToDocx(theme.accent),
                font: 'Helvetica',
              }),
            ],
          }));
        }
      });
    }

    // Custom sections (publications, volunteering, etc.)
    safeArray(resumeData.customSections).forEach((section) => {
      const title = cleanText(section?.title);
      const content = cleanText(section?.content);
      if (!title || !content) return;
      children.push(sectionHeading(title, theme));
      const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        lines.forEach((l) => children.push(bulletParagraph(l, theme)));
      } else {
        children.push(bodyParagraph(content, theme));
      }
    });

    // References (always last)
    const referencesText = cleanText(resumeData.referencesText);
    if (referencesText) {
      children.push(sectionHeading('References', theme));
      const trimmed = referencesText.trim();
      if (/^available on request\.?$/i.test(trimmed)) {
        children.push(bodyParagraph('Available on request.', theme));
      } else {
        trimmed.split(/\r?\n/).forEach((line) => {
          if (line.trim()) children.push(bodyParagraph(line, theme));
        });
      }
    }
  } else {
    // ============================================================
    // Standard templates — original section order
    // ============================================================
    const education = safeArray(resumeData.education);
    if (education.length) {
      children.push(sectionHeading('Education', theme));
      education.forEach((item) => {
        children.push(headingRow(cleanText(item?.degree, 'Qualification'), cleanText(item?.gpa), theme));
        children.push(subheadingRow(cleanText(item?.institution), '', theme));
        children.push(metaRow(cleanText(item?.year), cleanText(item?.location), theme));
      });
    }

    const experience = safeArray(resumeData.experience);
    if (experience.length) {
      children.push(sectionHeading('Experience', theme));
      experience.forEach((item) => {
        children.push(headingRow(cleanText(item?.role, 'Position'), cleanText(item?.duration), theme));
        children.push(subheadingRow(cleanText(item?.company), cleanText(item?.location), theme));
        safeArray(item?.points).forEach((p) => children.push(bulletParagraph(p, theme)));
        children.push(emptyParagraph());
      });
    }

    const projects = safeArray(resumeData.projects);
    if (projects.length) {
      children.push(sectionHeading('Projects', theme));
      projects.forEach((project) => {
        children.push(headingRow(cleanText(project?.name, 'Project'), '', theme));
        const technologies = Array.isArray(project?.technologies)
          ? project.technologies.filter(Boolean).join(', ')
          : cleanText(project?.technologies);
        if (technologies) {
          children.push(new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: technologies,
                size: 17,
                color: hexToDocx(theme.muted),
                font: 'Helvetica',
              }),
            ],
          }));
        }
        const points = safeArray(project?.points).filter(Boolean);
        if (points.length) {
          points.forEach((p) => children.push(bulletParagraph(p, theme)));
        } else if (project?.description) {
          children.push(bodyParagraph(project.description, theme));
        }
        children.push(emptyParagraph());
      });
    }

    // Skills
    const skills = safeArray(resumeData.skills)
      .map((s) => (typeof s === 'string' ? s.trim() : cleanText(s?.name)))
      .filter(Boolean);
    if (skills.length) {
      children.push(sectionHeading('Skills', theme));
      children.push(bodyParagraph(skills.join('  ·  '), theme));
    }

    // Certifications
    const certifications = safeArray(resumeData.certifications);
    if (certifications.length) {
      children.push(sectionHeading('Certifications', theme));
      certifications.forEach((item) => {
        const cert = typeof item === 'string' ? { name: item } : item;
        children.push(headingRow(cleanText(cert?.name), cleanText(cert?.year), theme));
        if (cert?.issuer) {
          children.push(new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: cleanText(cert.issuer),
                bold: true,
                size: 18,
                color: hexToDocx(theme.accent),
                font: 'Helvetica',
              }),
            ],
          }));
        }
      });
    }

    // Custom sections
    safeArray(resumeData.customSections).forEach((section) => {
      const title = cleanText(section?.title);
      const content = cleanText(section?.content);
      if (!title || !content) return;
      children.push(sectionHeading(title, theme));
      const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        lines.forEach((l) => children.push(bulletParagraph(l, theme)));
      } else {
        children.push(bodyParagraph(content, theme));
      }
    });
  }

  // Build the document
  const doc = new Document({
    creator: 'Hirely',
    title: `${fullName} - Resume`,
    description: 'Resume generated by Hirely',
    styles: {
      default: {
        document: {
          run: {
            font: 'Helvetica',
            size: 20,
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'default-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: {
                    left: convertInchesToTwip(0.25),
                    hanging: convertInchesToTwip(0.18),
                  },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.5),
              bottom: convertInchesToTwip(0.6),
              left: convertInchesToTwip(0.55),
              right: convertInchesToTwip(0.55),
            },
            size: {
              orientation: PageOrientation.PORTRAIT,
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return {
    buffer,
    filename: createSafeDocxFilename(firstName, lastName),
  };
}

function createSafeDocxFilename(firstName, lastName) {
  const fullName = `${firstName}_${lastName}`
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  return `${fullName || 'Hirely_Candidate'}_Resume.docx`;
}

module.exports = { generateResumeDocx };
