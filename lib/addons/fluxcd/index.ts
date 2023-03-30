// lib/fluxcd_addon.ts
import { Construct } from 'constructs';
import merge from "ts-deepmerge";
import { ClusterInfo, Values } from "../../spi";
import { createNamespace } from "../../utils";
import { HelmAddOn, HelmAddOnProps, HelmAddOnUserProps } from "../helm-addon";
import { FluxGitRepository, GitRepositoryProps } from "./gitrepository"
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { KubernetesManifest } from 'aws-cdk-lib/aws-eks/lib/k8s-manifest';
/**
 * User provided options for the Helm Chart
 */
export interface FluxCDAddOnProps extends HelmAddOnUserProps {
  /**
   * To Create Namespace using CDK
   */    
  createNamespace?: boolean;

  /**
   * Optional values for `GitRepository` Source to produce an Artifact for a Git repository revision.
   */
  gitRepositoryProps?: GitRepositoryProps;
}

/**
 * Default props to be used when creating the Helm chart
 */
const defaultProps: HelmAddOnProps & FluxCDAddOnProps = {
  name: "fluxcd-addon",
  namespace: "flux-system",
  chart: "flux2",
  version: "2.7.0",
  release: "blueprints-fluxcd-addon",
  repository: "https://fluxcd-community.github.io/helm-charts",
  values: {},
  createNamespace: true,
  gitRepositoryProps: {
    name: "samplerepo",
    namespace: "flux-system",
    interval: "5m0s",
    url: "https://github.com/aws-samples/eks-blueprints-workloads.git",
    branch: "master"
  }
};

/**
 * Main class to instantiate the Helm chart
 */
export class FluxCDAddOn extends HelmAddOn {

  readonly options: FluxCDAddOnProps;

  constructor(props?: FluxCDAddOnProps) {
    super({...defaultProps, ...props});
    this.options = this.props as FluxCDAddOnProps;
  }

  deploy(clusterInfo: ClusterInfo): Promise<Construct> {
    const cluster = clusterInfo.cluster;
    let values: Values = populateValues(this.options);
    values = merge(values, this.props.values ?? {});

    if( this.options.createNamespace == true){
      // Let CDK Create the Namespace
      const namespace = createNamespace(this.options.namespace! , cluster);
      const chart = this.addHelmChart(clusterInfo, values);
      chart.node.addDependency(namespace);

      //Lets create a GitRepository resource as a source to Flux
      const construct = createGitRepository(clusterInfo, this.options.gitRepositoryProps);
      chart.node.addDependency(construct);
      return Promise.resolve(chart);

    } else {
      //Namespace is already created
      const chart = this.addHelmChart(clusterInfo, values);
      //Lets create a GitRepository resource as a source to Flux
      const construct = createGitRepository(clusterInfo, this.options.gitRepositoryProps);
      chart.node.addDependency(construct);
      return Promise.resolve(chart);
    }
  }
}

/**
 * populateValues populates the appropriate values used to customize the Helm chart
 * @param helmOptions User provided values to customize the chart
 */
function populateValues(helmOptions: FluxCDAddOnProps): Values {
  const values = helmOptions.values ?? {};
  return values;
}

/**
 * createGitRepository calls the FluxGitRepository().generate to create GitRepostory resource.
 */
function createGitRepository(clusterInfo: ClusterInfo, gitRepositoryProps?: GitRepositoryProps): KubernetesManifest {
  const manifest = new FluxGitRepository().generate(gitRepositoryProps!);
  const construct = clusterInfo.cluster.addManifest(gitRepositoryProps?.name!, manifest);
  return construct;
}