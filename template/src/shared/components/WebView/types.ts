export type WebViewPageState = Readonly<{
  /** The address the view is showing now (it changes as the user follows links). */
  url: string;
  title: string;
}>;

export type WebViewProps = Readonly<{
  /** Page to load. Use `https`; the view refuses to follow other schemes itself. */
  url: string;
  /**
   * Hosts whose pages open inside the view (a host also allows its subdomains). Defaults to the
   * host of `url`. Links to any other site open in the system browser instead.
   */
  allowedHosts?: readonly string[];
  /** Changing this value reloads the current page. */
  reloadToken?: number;
  /** Called as the page changes, with its address and title. */
  onPageChange?: (page: WebViewPageState) => void;
  testID?: string;
}>;
