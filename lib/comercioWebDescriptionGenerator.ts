export type DescriptionTemplateId = string;

export type CommerceDescriptionInput = {
  productName: string;
  categoryName?: string | null;
  subcategoryName?: string | null;
  categoryKey?: string | null;
  subcategoryKey?: string | null;
  brand?: string | null;
  warrantyText?: string | null;
  technicalSpecs?: Array<string | null | undefined>;
};

export type DescriptionTemplateConfig = {
  id: DescriptionTemplateId;
  label: string;
  assigned_category_key?: string | null;
  keywords: string[];
  paragraph1: string;
  paragraph2: string;
  paragraph3: string;
  closing: string;
};

export type CommerceDescriptionGeneratorConfig = {
  templates: DescriptionTemplateConfig[];
};

const DEFAULT_CLOSING =
  "En Kensar te asesoramos para elegir el producto adecuado segun tu necesidad. Contactanos por WhatsApp para mas informacion.";

export const DEFAULT_COMMERCE_DESCRIPTION_CONFIG: CommerceDescriptionGeneratorConfig = {
  templates: [
    {
      id: "sonido",
      label: "Sonido",
      keywords: [
        "sonido",
        "amplificador",
        "cabina",
        "car audio",
        "consola",
        "megafono",
        "microfono",
        "parlante",
      ],
      paragraph1:
        "El [NOMBRE] es una excelente opcion para sistemas de sonido que requieren un uso practico y funcional.",
      paragraph2:
        "Ideal para eventos, DJs, instalaciones o uso profesional y domestico, ofrece un rendimiento estable y confiable en diferentes entornos.",
      paragraph3:
        "Su diseno permite una integracion practica dentro de configuraciones de audio, facilitando un sonido claro y equilibrado segun la necesidad.",
      closing:
        "En Kensar te asesoramos para elegir el equipo adecuado segun tu uso. Contactanos por WhatsApp para mas informacion.",
    },
    {
      id: "studio",
      label: "Studio",
      keywords: ["studio", "estudio", "monitoreo", "grabacion", "mezcla"],
      paragraph1:
        "El [NOMBRE] es una excelente opcion para entornos de grabacion, monitoreo o produccion de audio.",
      paragraph2:
        "Ideal para estudios, creadores de contenido y musicos, permite trabajar con mayor control y precision en el sonido.",
      paragraph3:
        "Su diseno esta orientado a ofrecer un rendimiento confiable en procesos de monitoreo, grabacion o mezcla.",
      closing:
        "En Kensar te asesoramos para elegir el equipo adecuado segun tu proyecto. Contactanos por WhatsApp para mas informacion.",
    },
    {
      id: "cables_accesorios",
      label: "Cables y Accesorios",
      keywords: [
        "cable",
        "accesorio",
        "audio profesional",
        "cables de red",
        "hdmi",
        "rca",
        "tripode",
        "conector",
      ],
      paragraph1:
        "El [NOMBRE] es una solucion practica para conexiones y configuraciones de audio, video o red.",
      paragraph2:
        "Ideal para instalaciones profesionales o uso domestico, permite una conexion estable y funcional entre dispositivos.",
      paragraph3:
        "Su diseno facilita el correcto funcionamiento de tus equipos en diferentes entornos.",
      closing:
        "En Kensar te asesoramos para elegir el accesorio adecuado segun tu necesidad. Contactanos por WhatsApp para mas informacion.",
    },
    {
      id: "hogar_entretenimiento",
      label: "Hogar y Entretenimiento",
      keywords: [
        "hogar",
        "entretenimiento",
        "televisor",
        "camara de seguridad",
        "seguridad",
        "luz solar",
      ],
      paragraph1:
        "El [NOMBRE] es una excelente opcion para mejorar la experiencia en el hogar o espacios personales.",
      paragraph2:
        "Ideal para entretenimiento, seguridad o uso diario, ofrece un funcionamiento practico y adaptable a diferentes necesidades.",
      paragraph3:
        "Su diseno esta pensado para integrarse facilmente en distintos entornos, brindando comodidad y funcionalidad.",
      closing:
        "En Kensar te asesoramos para elegir la mejor opcion segun tu espacio. Contactanos por WhatsApp para mas informacion.",
    },
    {
      id: "instrumentos",
      label: "Instrumentos Musicales",
      keywords: ["instrumento", "cuerda", "viento", "salsero", "salsa", "percusion", "teclado"],
      paragraph1:
        "El [NOMBRE] es una excelente opcion para quienes buscan un instrumento versatil y funcional.",
      paragraph2:
        "Ideal para aprendizaje, practica o presentaciones, ofrece una experiencia comoda y un sonido adecuado segun su uso.",
      paragraph3:
        "Su diseno permite un manejo practico, adaptandose a distintos niveles de experiencia.",
      closing:
        "En Kensar te asesoramos para elegir el instrumento adecuado segun tu necesidad. Contactanos por WhatsApp para mas informacion.",
    },
    {
      id: "instrumentos_latinos",
      label: "Instrumentos Latinos/Percusion",
      keywords: ["salsero", "salsa", "percusion", "conga", "bongo", "timbal"],
      paragraph1:
        "El [NOMBRE] es una excelente opcion para ritmos latinos y acompanamientos percusivos.",
      paragraph2:
        "Ideal para ensayos, presentaciones y uso musical, ofrece una respuesta sonora clara y facil ejecucion.",
      paragraph3:
        "Fabricado para un uso practico, permite integrarse en diferentes estilos y configuraciones musicales.",
      closing:
        "En Kensar te asesoramos para elegir el instrumento adecuado segun tu necesidad. Contactanos por WhatsApp para mas informacion.",
    },
    {
      id: "default",
      label: "General",
      keywords: [],
      paragraph1:
        "El [NOMBRE] es una opcion funcional para quienes buscan un producto confiable segun su necesidad.",
      paragraph2:
        "Ideal para uso diario, profesional o tecnico segun su aplicacion, permite una implementacion practica en distintos entornos.",
      paragraph3:
        "Su configuracion ofrece una solucion estable para tareas de conexion, operacion o soporte de equipos.",
      closing: DEFAULT_CLOSING,
    },
  ],
};

function normalizeText(value?: string | null): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function uniqueNonEmptyValues(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const cleaned = (value || "").trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(cleaned);
  });
  return output;
}

function resolveTemplates(
  config?: CommerceDescriptionGeneratorConfig
): DescriptionTemplateConfig[] {
  const source = config?.templates?.length
    ? config.templates
    : DEFAULT_COMMERCE_DESCRIPTION_CONFIG.templates;
  return source.map((template) => ({
    ...template,
    id: (template.id || "").trim(),
    label: (template.label || "").trim() || "Plantilla",
    assigned_category_key: (template.assigned_category_key || "").trim(),
    paragraph1: template.paragraph1 || "",
    paragraph2: template.paragraph2 || "",
    paragraph3: template.paragraph3 || "",
    closing: template.closing || "",
    keywords: Array.isArray(template.keywords)
      ? template.keywords.map((item) => item.trim()).filter(Boolean)
      : [],
  })).filter((template) => Boolean(template.id));
}

function selectTemplate(
  categoryKey: string,
  subcategoryKey: string,
  categoryName: string,
  subcategoryName: string,
  templates: DescriptionTemplateConfig[]
): DescriptionTemplateConfig {
  if (subcategoryKey) {
    const bySubcategory = templates.find(
      (template) => normalizeText(template.assigned_category_key) === subcategoryKey
    );
    if (bySubcategory) return bySubcategory;
  }
  if (categoryKey) {
    const byCategory = templates.find(
      (template) => normalizeText(template.assigned_category_key) === categoryKey
    );
    if (byCategory) return byCategory;
  }
  const combined = `${categoryName} ${subcategoryName}`.trim();
  if (combined) {
    const matched = templates.find((template) =>
      template.keywords.some((keyword) => combined.includes(normalizeText(keyword)))
    );
    if (matched) return matched;
  }
  return templates.find((template) => template.id === "default") || templates[0];
}

function interpolateTemplateText(value: string, productName: string): string {
  const template = (value || "").trim();
  if (!template) return "";
  const normalizedName = productName.trim();
  return template.replaceAll("[NOMBRE]", normalizedName).replaceAll("{NOMBRE}", normalizedName);
}

function buildDataSummary(input: CommerceDescriptionInput): string | null {
  const details: string[] = [];
  const brand = (input.brand || "").trim();
  const warranty = (input.warrantyText || "").trim();
  const specs = uniqueNonEmptyValues(input.technicalSpecs || []);
  if (brand) details.push(`Marca: ${brand}.`);
  if (warranty) details.push(`Garantia: ${warranty}.`);
  if (specs.length) {
    details.push(["Caracteristicas:", ...specs.map((item) => `- ${item}`)].join("\n"));
  }
  if (!details.length) return null;
  return details.join("\n");
}

export function generateCommerceWebDescription(
  input: CommerceDescriptionInput,
  config?: CommerceDescriptionGeneratorConfig
): string {
  const productName = (input.productName || "").trim();
  if (!productName) {
    throw new Error("El producto no tiene nombre para generar la descripcion.");
  }

  const categoryName = normalizeText(input.categoryName);
  const subcategoryName = normalizeText(input.subcategoryName);
  const categoryKey = normalizeText(input.categoryKey);
  const subcategoryKey = normalizeText(input.subcategoryKey);
  const templates = resolveTemplates(config);
  const template = selectTemplate(
    categoryKey,
    subcategoryKey,
    categoryName,
    subcategoryName,
    templates
  );

  const paragraphs = [
    interpolateTemplateText(template.paragraph1, productName),
    interpolateTemplateText(template.paragraph2, productName),
    interpolateTemplateText(template.paragraph3, productName),
  ].filter(Boolean);

  const dataSummary = buildDataSummary(input);
  if (dataSummary) {
    paragraphs.push(dataSummary);
  }

  const closing = interpolateTemplateText(template.closing, productName) || DEFAULT_CLOSING;
  paragraphs.push(closing);

  return paragraphs.join("\n\n").trim();
}
