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
  ExternalHyperlink,
  ImageRun,
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
  'academic-photo': {
    ink: '1A2A4F', body: '2C3E50', muted: '7B8794', accent: '1A2A4F', chip: 'E8EEF7', rule: '1A2A4F',
    headerAlign: AlignmentType.LEFT,
  },
};

function getTheme(templateId) {
  return TEMPLATE_THEMES[templateId] && TEMPLATE_THEMES[templateId].accent
    ? TEMPLATE_THEMES[templateId]
    : TEMPLATE_THEMES['ats-classic'];
}

/**
 * Format education date range from start + end (year) fields.
 *   start=2020, end=2024 -> "2020 - 2024"
 *   start=2020, end=''   -> "2020 - Present"
 *   start='',   end=2024 -> "2024"
 *   start='',   end=''   -> ""
 */
function formatEducationDateRange(startDate, endDate) {
  const start = cleanText(startDate);
  const end = cleanText(endDate);
  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} - Present`;
  if (end) return end;
  return '';
}

// ---------- contact icons (no visible text, only hyperlinked glyphs) ----------

// Returns a Paragraph containing hyperlinked Unicode glyphs for each contact
// item. Word renders Unicode symbols (✉ ☎ in 🔗) as small icon-like glyphs;
// clicking them opens mailto:/tel:/https: links. The actual contact string
// is NOT shown on the page, only the icon glyph.
function contactIconsParagraph(items, theme) {
  const children = [];
  const valid = items.filter((it) => it.label);
  if (!valid.length) return null;

  const glyphMap = {
    email: '\u2709',     // ✉
    phone: '\u260E',     // ☎
    linkedin: 'in',
    github: 'GH',
    portfolio: '\u26D3', // 🔗 (chain)
    location: '\u25C9',  // ◉ (location dot)
  };

  valid.forEach((item, idx) => {
    const glyph = glyphMap[item.type] || '\u25CF'; // ●
    const runChildren = [
      new TextRun({
        text: glyph,
        size: 22, // 11pt
        color: hexToDocx(theme.accent),
        font: 'Helvetica',
      }),
    ];

    if (item.link) {
      children.push(new ExternalHyperlink({ link: item.link, children: runChildren }));
    } else {
      children.push(...runChildren);
    }

    // Spacer between icons
    if (idx < valid.length - 1) {
      children.push(new TextRun({
        text: '    ', // 4 spaces between icons
        size: 22,
        color: hexToDocx(theme.body),
        font: 'Helvetica',
      }));
    }
  });

  return new Paragraph({
    alignment: theme.headerAlign,
    spacing: { after: 120 },
    children,
  });
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

  // --- header ---
  // For academic-photo: use a 2-column table — name/target on left, photo on right.
  // For all other templates: simple centered/left-aligned name + target role.
  if (templateId === 'academic-photo') {
    // Try to embed the photo from base64 data
    const photoBase64 = cleanText(resumeData.photoBase64);
    let photoImageRun = null;
    if (photoBase64) {
      try {
        const buffer = Buffer.from(photoBase64, 'base64');
        // 4:5 portrait. Width ~1.0 inch, height ~1.25 inch (in EMUs/points).
        // docx ImageRun uses pixels at 72 DPI for sizing.
        photoImageRun = new ImageRun({
          data: buffer,
          transformation: { width: 95, height: 119 },
          type: 'jpg',
        });
      } catch (err) {
        console.warn('Failed to embed photo in DOCX:', err.message);
      }
    }

    const leftCellChildren = [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: fullName,
            bold: true,
            size: 44,
            color: hexToDocx(theme.ink),
            font: 'Helvetica',
          }),
        ],
      }),
    ];
    if (targetRole) {
      leftCellChildren.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 0 },
        children: [
          new TextRun({
            text: targetRole,
            bold: true,
            size: 22,
            color: hexToDocx(theme.accent),
            font: 'Helvetica',
          }),
        ],
      }));
    }

    const rightCellChildren = photoImageRun
      ? [new Paragraph({ children: [photoImageRun] })]
      : // Fallback: initials avatar (text-based since we can't easily draw shapes in docx)
        [new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 240 },
          children: [
            new TextRun({
              text: `${firstName.charAt(0) || 'A'}${lastName.charAt(0) || 'U'}`.toUpperCase(),
              bold: true,
              size: 56,
              color: hexToDocx(theme.accent),
              font: 'Helvetica',
            }),
          ],
        })];

    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 75, type: WidthType.PERCENTAGE },
              margins: { top: 0, bottom: 0, left: 0, right: 100 },
              children: leftCellChildren,
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              margins: { top: 0, bottom: 0, left: 100, right: 0 },
              children: rightCellChildren,
            }),
          ],
        }),
      ],
    }));

    // Spacer paragraph after the header table
    children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
  } else {
    // All other templates: simple header
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
  }

  // academic personal details line
  if (templateId === 'eu-academic' || templateId === 'academic-photo') {
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

  // contact icons (no visible text — only hyperlinked Unicode glyphs)
  const email = cleanText(resumeData.email);
  const phone = cleanText(resumeData.phone);
  const location = cleanText(resumeData.location);
  const linkedin = cleanText(resumeData.linkedin);
  const github = cleanText(resumeData.github);
  const portfolio = cleanText(resumeData.portfolio);

  const contactItems = [
    { type: 'email',    label: email,    link: email ? `mailto:${email}` : '' },
    { type: 'phone',    label: phone,    link: phone ? `tel:${phone.replace(/\s+/g, '')}` : '' },
    { type: 'location', label: location, link: '' },
    { type: 'linkedin', label: linkedin, link: linkedin ? (linkedin.startsWith('http') ? linkedin : `https://${linkedin}`) : '' },
    { type: 'github',   label: github,   link: github ? (github.startsWith('http') ? github : `https://${github}`) : '' },
    { type: 'portfolio',label: portfolio,link: portfolio ? (portfolio.startsWith('http') ? portfolio : `https://${portfolio}`) : '' },
  ].filter((it) => it.label);

  if (contactItems.length) {
    const iconsPara = contactIconsParagraph(contactItems, theme);
    if (iconsPara) children.push(iconsPara);
  }

  // summary / personal statement
  const summary = cleanText(resumeData.summary);
  if (summary) {
    children.push(sectionHeading(
      (templateId === 'eu-academic' || templateId === 'academic-photo') ? 'Personal Statement' : 'Summary',
      theme
    ));
    children.push(bodyParagraph(summary, theme));
  }

  // ============================================================
  // EU ACADEMIC — Europass-style section order
  // ============================================================
  if (templateId === 'eu-academic' || templateId === 'academic-photo') {
    const education = safeArray(resumeData.education);
    if (education.length) {
      children.push(sectionHeading('Education', theme));
      education.forEach((item) => {
        // Line 1: degree (left) + gpa (right)
        children.push(headingRow(
          cleanText(item?.degree, 'Qualification'),
          cleanText(item?.gpa),
          theme
        ));
        // Line 2: institution (left) + date range (right)
        const dateRange = formatEducationDateRange(item?.startDate, item?.year);
        if (cleanText(item?.institution) || dateRange) {
          children.push(subheadingRow(cleanText(item?.institution), dateRange, theme));
        }
        // Line 3: location
        if (item?.location) {
          children.push(metaRow(cleanText(item?.location), '', theme));
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
        // Line 1: degree (left) + gpa (right)
        children.push(headingRow(cleanText(item?.degree, 'Qualification'), cleanText(item?.gpa), theme));
        // Line 2: institution (left) + date range (right)
        const dateRange = formatEducationDateRange(item?.startDate, item?.year);
        if (cleanText(item?.institution) || dateRange) {
          children.push(subheadingRow(cleanText(item?.institution), dateRange, theme));
        }
        // Line 3: location
        if (item?.location) {
          children.push(metaRow(cleanText(item?.location), '', theme));
        }
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
