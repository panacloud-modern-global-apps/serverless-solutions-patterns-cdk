# Welcome to your CDK TypeScript project!

## What Is Route 53?

Amazon Route 53 is a highly available and scalable cloud Domain Name System (DNS) web service. It is designed to give developers and businesses an extremely reliable and cost effective way to route end users to Internet applications by translating names like www.example.com into the numeric IP addresses like 192.0.2.1 that computers use to connect to each other. Amazon Route 53 is fully compliant with IPv6 as well.

## Arhitecture

arhitecture Image (https://raw.githubusercontent.com/cdk-patterns/serverless/master/s3-react-website/img/architecture.PNG)

### What is ACM (AWS Certificate Manager) ?

AWS Certificate Manager is a service that lets you easily provision, manage, and deploy public and private Secure Sockets Layer/Transport Layer Security (SSL/TLS) certificates for use with AWS services and your internal connected resources. SSL/TLS certificates are used to secure network communications and establish the identity of websites over the Internet as well as resources on private networks.

## What Is DNS ?

The Domain Name System (DNS) is a central part of the internet, providing a way to match names (a website you’re seeking) to numbers (the address for the website). Anything connected to the internet - laptops, tablets, mobile phones, websites - has an Internet Protocol (IP) address made up of numbers. Your favorite website might have an IP address like 64.202.189.170, but this is obviously not easy to remember. However a domain name such as bestdomainnameever.com is something people can recognize and remember.

### Hosted zone

A hosted zone is a container for records, and records contain information about how you want to route traffic for a specific domain, such as example.com, and its subdomains (acme.example.com, zenith.example.com). A hosted zone and the corresponding domain have the same name. There are two types of hosted zones.

- Public hosted zones contain records that specify how you want to route traffic on the internet.
- Private hosted zones contain records that specify how you want to route traffic in an Amazon VPC.

### Nameserver

Nameserver is a server on the Internet specialized in handling queries regarding the location of the domain name's various services. In easy words, name servers define your domain's current DNS provider. All domains usually have at least two DNS servers which can be checked via Whois lookup tool.

#### Step 1 (Create A Hosted zone & AWS Certificate)

```typescript
import * as route53 from "@aws-cdk/aws-route53"

const myZone = new route53.PublicHostedZone(this, "HostedZone", {
  zoneName: "s3pattern.tk",
}) as IHostedZone

const certificate = new Certificate(this, "Certificate", {
  domainName: "s3pattern.tk",
  validation: CertificateValidation.fromDns(myZone), // Records must be added manually
})
```

### Step 2 (Create A Cloudfront Distribution Of Website Using AWS S3)

```typescript
import {
  CloudFrontToS3,
  CloudFrontToS3Props,
} from "@aws-solutions-constructs/aws-cloudfront-s3"

const cfs3props: CloudFrontToS3Props = {
  insertHttpSecurityHeaders: false,
  cloudFrontDistributionProps: {
    certificate,
    domainNames: ["s3pattern.tk"],
  },
} // I disabled the security headers because they use a lambda edge which is available for us-east-1

const s3_cloudfront_construct = new CloudFrontToS3(
  this,
  "cloudfronts3",
  cfs3props
)
```

- This AWS Solutions Construct implements an Amazon CloudFront distribution in front of an Amazon S3 bucket.

### Step 3 (Create Record For Zone)

```typescript
new route53.ARecord(this, "AliasA", {
  zone: myZone,
  target: route53.RecordTarget.fromAlias(
    new targets.CloudFrontTarget(
      s3_cloudfront_construct.cloudFrontWebDistribution
    )
  ),
})

//Adding ipv6 record
new route53.AaaaRecord(this, "Alias", {
  zone: myZone,
  target: route53.RecordTarget.fromAlias(
    new targets.CloudFrontTarget(
      s3_cloudfront_construct.cloudFrontWebDistribution
    )
  ),
})
```

- Creating a new Record in Route 53 to point to our CloudFront distribution


## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
