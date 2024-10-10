// vpc.ts
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface VpcProps {
  stackName: string;
  vpcCidr: string;
  quantumServerPort: number;
}

export class VpcConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: VpcProps) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, `${props.stackName}-Vpc`, {
      cidr: props.vpcCidr,
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24, // CIDR mask for the subnet
          name: 'PrivateSubnet',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED, // Use PRIVATE_WITH_NAT if you need NAT for outbound traffic
        },
        {
          cidrMask: 24,
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
        }
      ],
    });

    this.securityGroup = new ec2.SecurityGroup(this, `${props.stackName}-SG`, {
      vpc: this.vpc,
      description: 'Allow inbound traffic on container port',
      allowAllOutbound: true,
    });

    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(props.quantumServerPort), // Parameterize if necessary
      'Allow inbound traffic on container port'
    );
  }
}
