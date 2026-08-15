/**
 * The single content column every page sits in.
 *
 * One width for every route on purpose: pages used to set their own max-width
 * (1100–1400), so the content box jumped sideways on every navigation and
 * otherwise identical filter bars wrapped at different points. Change the
 * width here, not at a call site.
 */
export const PAGE_CONTAINER = 'mx-auto max-w-[1400px] px-8 py-7';
