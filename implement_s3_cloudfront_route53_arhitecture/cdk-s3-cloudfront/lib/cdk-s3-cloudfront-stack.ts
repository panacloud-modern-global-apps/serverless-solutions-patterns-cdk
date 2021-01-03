import * as cdk from "@aws-cdk/core"
import * as s3deploy from "@aws-cdk/aws-s3-deployment"
import {CloudFrontToS3,CloudFrontToS3Props} from "@aws-solutions-constructs/aws-cloudfront-s3"
import * as route53 from "@aws-cdk/aws-route53"
import * as targets from "@aws-cdk/aws-route53-targets"
import * as acm from "@aws-cdk/aws-certificatemanager"
import { IHostedZone } from "@aws-cdk/aws-route53"
import {ICertificate} from "@aws-cdk/aws-certificatemanager"
import { Bucket } from "@aws-cdk/aws-s3"

export class CdkS3CloudfrontStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const myZone = new route53.PublicHostedZone(this, "HostedZone", {
      zoneName: "s3pattern.tk",
    }) as IHostedZone

    const certificate = new acm.DnsValidatedCertificate(this, 'CrossRegionCertificate', {
      domainName: 's3pattern.tk',
      hostedZone: myZone,
      region: "us-east-1",
    })as ICertificate;

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

    const deployment = new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [s3deploy.Source.asset("../frontend/public")],
      destinationBucket: s3_cloudfront_construct.s3Bucket as Bucket,
      distribution: s3_cloudfront_construct.cloudFrontWebDistribution,
    })

    deployment.node.addDependency(s3_cloudfront_construct)

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

    new cdk.CfnOutput(this, "bucketName", {
      value: `${s3_cloudfront_construct.s3Bucket?.bucketName}`,
    })

    new cdk.CfnOutput(this, "websiteURL", {
      value:"https://"+s3_cloudfront_construct.cloudFrontWebDistribution.domainName,
    })

    new cdk.CfnOutput(this, "URL", {
      description: "The URL of the site",
      value: myZone.zoneName,
    })

    new cdk.CfnOutput(this, "id", {
      value: myZone.hostedZoneId,
    })
  }
}
