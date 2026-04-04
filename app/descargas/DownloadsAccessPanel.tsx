"use client";

import Image from "next/image";
import type { DownloadResource } from "@/lib/downloadResources";

type Props = {
  resources: DownloadResource[];
};

export default function DownloadsAccessPanel({ resources }: Props) {
  return (
    <>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80">
        {resources.map((resource, index) => (
          <article
            key={resource.slug}
            className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
              index < resources.length - 1 ? "border-b border-slate-200/80" : ""
            }`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <Image
                src={resource.logo}
                alt={`Logo ${resource.name}`}
                width={64}
                height={64}
                className={`${resource.logoClassName ?? "h-12 w-12"} rounded-xl bg-white p-1 object-contain`}
              />
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-tight text-slate-900 sm:text-xl">
                  {resource.name}
                </h2>
                <p className="mt-1 text-[0.8rem] font-semibold uppercase tracking-[0.15em] text-slate-500 sm:text-[0.9rem]">
                  {resource.platform}
                </p>
                <p className="mt-1.5 text-[0.96rem] text-slate-600 sm:text-[1.08rem]">
                  {resource.description}
                </p>
                <p className="mt-1.5 text-[0.9rem] text-slate-500 sm:text-[1rem]">
                  {resource.requirements}
                </p>
              </div>
            </div>
            <a
              href={`/api/downloads/${resource.slug}`}
              aria-label={`Descargar ${resource.name}`}
              title={`Descargar ${resource.name}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center self-end text-[#3154e8] transition hover:scale-105 hover:text-[#2a45c5] sm:self-auto"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[28px] w-[28px]"
              >
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
            </a>
          </article>
        ))}
      </div>
    </>
  );
}
