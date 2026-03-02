# Security Audit Checklist

Use this checklist when performing security audits. Write results to `.party/findings/security-audit.md`.

## Secret Detection
- [ ] No hardcoded passwords or passphrases
- [ ] No hardcoded API keys or tokens
- [ ] No hardcoded connection strings with credentials
- [ ] No private keys or certificates in source
- [ ] .env files not committed to repository
- [ ] .gitignore includes sensitive file patterns

## Injection Vulnerabilities
- [ ] SQL queries use parameterized statements
- [ ] NoSQL queries use safe APIs
- [ ] Shell commands use proper escaping
- [ ] LDAP queries use safe binding
- [ ] XML parsing disables external entities (XXE)
- [ ] Template rendering prevents SSTI

## Cross-Site Scripting (XSS)
- [ ] HTML output is properly escaped/encoded
- [ ] JavaScript context uses safe encoding
- [ ] URL parameters are validated and encoded
- [ ] Content-Security-Policy headers configured
- [ ] DOM manipulation uses safe APIs (textContent vs innerHTML)

## Authentication
- [ ] Password hashing uses bcrypt/scrypt/argon2
- [ ] Session tokens are cryptographically random
- [ ] Session expiration is configured
- [ ] Multi-factor authentication available for sensitive operations
- [ ] Account lockout after failed attempts
- [ ] Password reset tokens expire

## Authorization
- [ ] Role-based access control implemented correctly
- [ ] No horizontal privilege escalation (accessing other users' data)
- [ ] No vertical privilege escalation (admin functions without admin role)
- [ ] API endpoints check authorization before processing
- [ ] File access permissions are validated

## Data Protection
- [ ] Sensitive data encrypted at rest
- [ ] TLS/HTTPS for data in transit
- [ ] PII handled according to privacy requirements
- [ ] Logging does not include sensitive data
- [ ] Error messages do not leak internal details

## Cryptography
- [ ] Encryption uses current standards (AES-256, RSA-2048+)
- [ ] No deprecated algorithms (MD5, SHA1 for security, DES, RC4)
- [ ] Random number generation uses cryptographic PRNG
- [ ] Key management follows best practices
- [ ] Certificates validated properly

## Severity Classification
- **CRITICAL**: Actively exploitable, data breach risk, immediate fix required
- **HIGH**: Exploitable with moderate effort, address before deployment
- **MEDIUM**: Potential vulnerability, address in current sprint
- **LOW**: Best practice violation, track in backlog
