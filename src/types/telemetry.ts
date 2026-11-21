export type SecurityGrade = "A+" | "A" | "A-" | "B+" | "B" | "C" | "D" | "F";

export type HeaderStatus = "pass" | "warn" | "fail";

export interface CertificateParty {
  CN?: string;
  O?: string;
  OU?: string;
  C?: string;
  L?: string;
  ST?: string;
}

export interface CertificateChainItem {
  subjectCN: string;
  issuerCN: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number | null;
  isExpired: boolean;
  expiringSoon: boolean;
  fingerprint256: string;
}

export interface SslDetails {
  available: boolean;
  authorized: boolean;
  authorizationError: string | null;
  protocol: string | null;
  cipherName: string | null;
  cipherVersion: string | null;
  subject: CertificateParty;
  issuer: CertificateParty;
  validFrom: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  isExpired: boolean;
  isNotYetValid: boolean;
  chainHasExpiredCert: boolean;
  chainHasExpiringSoonCert: boolean;
  serialNumber: string | null;
  fingerprint256: string | null;
  keyBits: number | null;
  asn1Curve: string | null;
  subjectAltNames: string[];
  chain: CertificateChainItem[];
  handshakeMs: number;
  error?: string;
}

export interface SecurityHeaderCheck {
  id: string;
  name: string;
  value: string | null;
  status: HeaderStatus;
  score: number;
  maxScore: number;
  severity: "critical" | "high" | "medium" | "low";
  issueKey: string;
  recommendationKey: string;
  fixSnippet: string;
}

export interface HttpResponseInfo {
  finalUrl: string;
  statusCode: number;
  statusMessage: string;
  httpVersion: string;
  responseTimeMs: number;
  redirects: string[];
  httpsRedirectEnforced: boolean | null;
  serverHeader: string | null;
  poweredByHeader: string | null;
  contentType: string | null;
}

export interface AuditScoreBreakdown {
  tlsScore: number;
  tlsMax: number;
  headersScore: number;
  headersMax: number;
  transportScore: number;
  transportMax: number;
}

export type CookieIssueCode = "missing_secure" | "missing_httponly" | "weak_samesite";

export interface CookieAuditItem {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
  issues: CookieIssueCode[];
}

export interface CookieAuditSummary {
  total: number;
  secureCount: number;
  insecureCount: number;
  cookies: CookieAuditItem[];
}

export interface AuditResult {
  target: string;
  hostname: string;
  resolvedIp: string | null;
  ipFamily: number | null;
  scannedAt: string;
  score: number;
  grade: SecurityGrade;
  breakdown: AuditScoreBreakdown;
  ssl: SslDetails;
  http: HttpResponseInfo;
  headers: SecurityHeaderCheck[];
  cookies: CookieAuditSummary;
  issuesCount: {
    fail: number;
    warn: number;
    pass: number;
  };
  timedOut?: boolean;
}

export interface DnsAddressRecord {
  address: string;
  ttl?: number;
}

export interface DnsMxRecord {
  exchange: string;
  priority: number;
}

export interface DnsSoaRecord {
  nsname: string;
  hostmaster: string;
  serial: number;
  refresh: number;
  retry: number;
  expire: number;
  minttl: number;
}

export interface DnsRecordsBundle {
  A: DnsAddressRecord[];
  AAAA: DnsAddressRecord[];
  MX: DnsMxRecord[];
  TXT: string[];
  NS: string[];
  CNAME: string[];
  SOA: DnsSoaRecord | null;
}

export interface LatencyPulse {
  index: number;
  timestamp: string;
  dnsMs: number | null;
  tcpMs: number | null;
  tlsMs: number | null;
  ttfbMs: number | null;
  totalMs: number | null;
  statusCode: number | null;
  ok: boolean;
  error?: string | null;
}

export interface LatencyStats {
  min: number | null;
  avg: number | null;
  max: number | null;
  jitter: number | null;
}

export type DnsRecordTypeKey = "A" | "AAAA" | "MX" | "TXT" | "NS" | "CNAME" | "SOA";

export interface DnsPingResult {
  target: string;
  hostname: string;
  resolvedIp: string | null;
  scannedAt: string;
  dnsTotalQueryMs: number;
  resolverSource?: "system" | "public-fallback";
  recordErrors?: Partial<Record<DnsRecordTypeKey, string>>;
  records: DnsRecordsBundle;
  pulses: LatencyPulse[];
  stats: {
    dns: LatencyStats;
    tcp: LatencyStats;
    tls: LatencyStats;
    ttfb: LatencyStats;
    total: LatencyStats;
    packetLossPercent: number;
  };
  timedOut?: boolean;
}

export type PortStatus = "open" | "closed" | "filtered" | "error";
export type PortScanTimeoutMode = "fast" | "deep";

export interface PortScanItem {
  port: number;
  service: string;
  protocol: "TCP";
  status: PortStatus;
  latencyMs: number | null;
  errorCode?: string | null;
  risk: "info" | "low" | "medium" | "high";
  noteKey: string;
}

export interface PortScanResult {
  target: string;
  hostname: string;
  resolvedIp: string;
  scannedAt: string;
  durationMs: number;
  timeoutMs?: number;
  ports: PortScanItem[];
  summary: {
    total: number;
    open: number;
    closed: number;
    filtered: number;
    error: number;
  };
  timedOut?: boolean;
}

export type CpuMetricSource = "windows-pdh" | "os-delta";

export interface CpuCoreTelemetry {
  core: number;
  model: string;
  speedMhz: number;
  usagePercent: number;
}

export interface NetworkInterfaceEntry {
  name: string;
  mac: string;
  ipv4: string[];
  ipv6: string[];
  cidr: string[];
  netmask: string[];
  internal: boolean;
}

export interface SystemTelemetryResult {
  timestamp: string;
  hostname: string;
  platform: string;
  osType: string;
  release: string;
  version: string;
  arch: string;
  uptimeSeconds: number;
  nodeVersion: string;
  cpu: {
    model: string;
    coresCount: number;
    speedMhz: number;
    usagePercent: number;
    metricSource: CpuMetricSource;
    loadAvg: [number, number, number] | null;
    perCore: CpuCoreTelemetry[];
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    availableBytes: number;
    usagePercent: number;
    processRssBytes: number;
    processHeapUsedBytes: number;
    appWorkingSetBytes: number | null;
  };
  networkInterfaces: NetworkInterfaceEntry[];
}

export type ScanHistoryType = "audit" | "dns" | "ports";

export interface ScanHistoryEntry {
  id: string;
  type: ScanHistoryType;
  hostname: string;
  scannedAt: string;
  summary: string;
  grade?: SecurityGrade;
  score?: number;
  openPorts?: number;
  avgTtfbMs?: number | null;
  auditData?: AuditResult;
  dnsData?: DnsPingResult;
  portData?: PortScanResult;
}
