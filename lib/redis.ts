import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

export interface RedisConstructProps {
  vpc: ec2.IVpc;
}

export class RedisConstruct extends Construct {
  public readonly redisEndpoint: string;
  public readonly redisPort: number = 6379;

  constructor(scope: Construct, id: string, props: RedisConstructProps) {
    super(scope, id);

    // Create a Security Group for Redis
    const securityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true,
    });

    // Allow inbound traffic on the Redis default port (6379)
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(this.redisPort),
      'Allow Redis traffic'
    );

    // Create a Redis Subnet Group
    const subnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Redis',
      subnetIds: props.vpc.publicSubnets.map(subnet => subnet.subnetId),
    });

    // Create the Redis Cluster
    const redisCluster = new elasticache.CfnCacheCluster(this, 'RedisCluster', {
      cacheNodeType: 'cache.t2.small', // Smallest Redis instance type
      engine: 'redis',
      numCacheNodes: 1, // Number of nodes in the cluster
      vpcSecurityGroupIds: [securityGroup.securityGroupId],
      cacheSubnetGroupName: subnetGroup.ref,
    });

    // Expose the Redis endpoint
    this.redisEndpoint = redisCluster.attrRedisEndpointAddress;
  }
}
