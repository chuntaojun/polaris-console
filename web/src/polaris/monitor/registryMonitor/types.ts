import moment from 'moment'
import { getMonitorData } from '../models'

export enum MetricName {
  Node = 'Node',
  Connect = 'Connect',
  Request = 'Request',
  Timeout = 'Timeout',
  Service = 'Service',
  Instance = 'Instance',
  ConfigGroup = 'ConfigGroup',
  ConfigFile = 'ConfigFile',
  ErrorReq = 'ErrorReq',
  RetCode = 'RetCode',
}
const LatestValueReduceFunction = (prev, curr, index, array) => {
  const [, value] = curr
  if (index === array?.length - 1) return Math.floor(Number(value))
}

const SumUpReduceFunction = (prev, curr, index, array) => {
  const [, value] = curr
  if (index === array.length - 1) return Math.floor(prev + Number(value))
  return prev + Number(value)
}

const AvgReduceFunction = (prev, curr, index, array) => {
  const [, value] = curr
  if (index === array.length - 1) return (prev / array.filter(item => item.value !== '0').length).toFixed(2)
  return prev + Number(value)
}

export const getQueryMap = {
  [MetricName.Node]: () => [
    {
      name: '总节点数',
      query: 'max(client_total) by (polaris_server_instance)',
      boardFunction: LatestValueReduceFunction,
      unit: '个',
    },
  ],
  [MetricName.Connect]: () => [
    {
      name: '总连接数',
      query: 'sum(sdk_client_total)',
      boardFunction: LatestValueReduceFunction,
    },
    {
      name: '注册中心连接数',
      query: 'sum(discovery_conn_total)',
      boardFunction: LatestValueReduceFunction,
    },
    {
      name: '配置中心连接数',
      query: 'sum(config_conn_total)',
      boardFunction: LatestValueReduceFunction,
    },
  ],
  [MetricName.Request]: (queryParam = {} as any) => {
    const { interfaceName, podName } = queryParam
    return [
      {
        name: '总请求数',
        query:
          interfaceName && podName
            ? `sum(client_rq_interval_count{api=~"${interfaceName}",polaris_server_instance="${podName}"})`
            : interfaceName
            ? `sum(client_rq_interval_count{api=~"${interfaceName}"})`
            : 'sum(client_rq_interval_count)',
        boardFunction: SumUpReduceFunction,
      },
      {
        name: '成功请求数',
        query:
          interfaceName && podName
            ? `sum(client_rq_interval_count{err_code=~"2.+|0",api=~"${interfaceName}",polaris_server_instance="${podName}"})`
            : interfaceName
            ? `sum(client_rq_interval_count{err_code=~"2.+|0",api=~"${interfaceName}"})`
            : 'sum(client_rq_interval_count{err_code=~"2.+|0"})',
        boardFunction: SumUpReduceFunction,
      },
      {
        name: '失败请求数',
        query:
          interfaceName && podName
            ? `sum(client_rq_interval_count{err_code!~"2.+|0",api=~"${interfaceName}",polaris_server_instance="${podName}"})`
            : interfaceName
            ? `sum(client_rq_interval_count{err_code!~"2.+|0",api=~"${interfaceName}"})`
            : 'sum(client_rq_interval_count{err_code!~"2.+|0"})',
        boardFunction: SumUpReduceFunction,
      },
      {
        name: '请求成功率',
        query:
          interfaceName && podName
            ? `sum(client_rq_interval_count{err_code=~"2.+|0",api=~"${interfaceName},polaris_server_instance="${podName}"}) / sum(client_rq_interval_count{api=~"${interfaceName}",polaris_server_instance="${podName}})`
            : interfaceName
            ? `sum(client_rq_interval_count{err_code=~"2.+|0",api=~"${interfaceName}"}) / sum(client_rq_interval_count{api=~"${interfaceName}"})`
            : 'sum(client_rq_interval_count{err_code=~"2.+|0"}) / sum(client_rq_interval_count)',
        boardFunction: (prev, curr, index, array) => {
          const [, value] = curr
          if (index === array.length - 1) return ((prev / array.length) * 100).toFixed(2)
          return prev + Number(value)
        },
        unit: '%',
        noLine: true,
      },
    ]
  },
  [MetricName.Timeout]: queryParam => {
    const { interfaceName, podName, start, end, step } = queryParam
    const interval = moment.duration(end - start, 's').asMinutes() + 'm'
    return [
      {
        name: '均值',
        query:
          interfaceName && podName
            ? `client_rq_timeout_avg{api=~"${interfaceName}",polaris_server_instance="${podName}"}`
            : interfaceName
            ? `client_rq_timeout_avg{api=~"${interfaceName}"}`
            : 'client_rq_timeout_avg',
        boardFunction: AvgReduceFunction,
        unit: 'ms',
      },
      {
        name: '最大值',
        query:
          interfaceName && podName
            ? `client_rq_timeout_max{api=~"${interfaceName}",polaris_server_instance="${podName}"}`
            : interfaceName
            ? `client_rq_timeout_max{api=~"${interfaceName}"}`
            : 'client_rq_timeout_max',
        boardFunction: AvgReduceFunction,
        unit: 'ms',
      },
      {
        name: '最小值',
        query:
          interfaceName && podName
            ? `client_rq_timeout_min{api=~"${interfaceName}",polaris_server_instance="${podName}"}`
            : interfaceName
            ? `client_rq_timeout_min{api=~"${interfaceName}"}`
            : 'client_rq_timeout_min',
        boardFunction: AvgReduceFunction,
        unit: 'ms',
      },
      {
        name: 'P99',
        query:
          interfaceName && podName
            ? `histogram_quantile(0.99, rate(client_rq_time_ms_bucket{api=~"${interfaceName}",polaris_server_instance="${podName}"}[${interval}]))`
            : interfaceName
            ? `histogram_quantile(0.99, rate(client_rq_time_ms_bucket{api=~"${interfaceName}"}[${interval}]))`
            : `histogram_quantile(0.99, rate(client_rq_timeout[${interval}]))`,
        asyncBoardFunction: async () => {
          const res = await getMonitorData({
            start,
            end,
            step,
            query:
              interfaceName && podName
                ? `histogram_quantile(0.99, sum by(le) (rate(client_rq_time_ms_bucket{api=~"${interfaceName}",polaris_server_instance="${podName}"}[${interval}])))`
                : interfaceName
                ? `histogram_quantile(0.99, sum by(le) (rate(client_rq_time_ms_bucket{api=~"${interfaceName}"}[${interval}])))`
                : `histogram_quantile(0.99, sum by(le) (rate(client_rq_time_ms_bucket[${interval}])))`,
          })
          const point = res?.[0]?.values?.[0]
          if (!point) return '-'
          const [, value] = point
          return value
        },
        unit: 'ms',
      },
      {
        name: 'P95',
        query:
          interfaceName && podName
            ? `histogram_quantile(0.95, rate(client_rq_time_ms_bucket{api=~"${interfaceName}",polaris_server_instance="${podName}"}[${interval}]))`
            : interfaceName
            ? `histogram_quantile(0.95, rate(client_rq_time_ms_bucket{api=~"${interfaceName}"}[${interval}]))`
            : `histogram_quantile(0.95, rate(client_rq_timeout[${interval}]))`,
        asyncBoardFunction: async () => {
          const res = await getMonitorData({
            start,
            end,
            step,
            query:
              interfaceName && podName
                ? `histogram_quantile(0.95, sum by(le) (rate(client_rq_time_ms_bucket{api=~"${interfaceName}",polaris_server_instance="${podName}"}[${interval}])))`
                : interfaceName
                ? `histogram_quantile(0.95, sum by(le) (rate(client_rq_time_ms_bucket{api=~"${interfaceName}"}[${interval}])))`
                : `histogram_quantile(0.95, sum by(le) (rate(client_rq_time_ms_bucket[${interval}])))`,
          })
          const point = res?.[0]?.values?.[0]
          if (!point) return '-'
          const [, value] = point
          return value
        },
        unit: 'ms',
      },
    ]
  },
  [MetricName.Service]: queryParam => {
    const { namespace } = queryParam
    return [
      {
        name: '总服务数',
        query: namespace
          ? `max(sum(service_count{namespace="${namespace}"}) by(polaris_server_instance))`
          : 'max(sum(service_count) by(polaris_server_instance))',
        boardFunction: LatestValueReduceFunction,
      },
      {
        name: '在线服务数',
        query: namespace
          ? `max(sum(service_online_count{namespace="${namespace}"}) by(polaris_server_instance))`
          : 'max(sum(service_online_count) by(polaris_server_instance))',
        boardFunction: LatestValueReduceFunction,
      },
      {
        name: '异常服务数',
        query: namespace
          ? `max(sum(service_abnormal_count{namespace="${namespace}"}) by(polaris_server_instance))`
          : 'max(sum(service_abnormal_count) by(polaris_server_instance))',
        boardFunction: LatestValueReduceFunction,
      },
      {
        name: '离线服务数',
        query: namespace
          ? `max(sum(service_offline_count{namespace="${namespace}"}) by(polaris_server_instance))`
          : 'max(sum(service_offline_count) by(polaris_server_instance))',
        boardFunction: LatestValueReduceFunction,
      },
    ]
  },
  [MetricName.Instance]: queryParam => {
    const { namespace, service } = queryParam
    return [
      {
        name: '总实例数',
        query:
          namespace && service
            ? `max(sum(instance_count{namespace="${namespace}",service="${service}"}) by(polaris_server_instance))`
            : namespace
            ? `max(sum(instance_count{namespace="${namespace}"}) by(polaris_server_instance))`
            : 'max(sum(instance_count) by(polaris_server_instance))',
        boardFunction: LatestValueReduceFunction,
      },
      {
        name: '在线实例数',
        query:
          namespace && service
            ? `max(sum(instance_online_count{namespace="${namespace}",service="${service}"}) by(polaris_server_instance))`
            : namespace
            ? `max(sum(instance_online_count{namespace="${namespace}"}) by(polaris_server_instance))`
            : 'max(sum(instance_online_count) by(polaris_server_instance))',
        boardFunction: LatestValueReduceFunction,
      },
      {
        name: '隔离实例数',
        query:
          namespace && service
            ? `max(sum(instance_isolate_count{namespace="${namespace}",service="${service}"}) by(polaris_server_instance))`
            : namespace
            ? `max(sum(instance_isolate_count{namespace="${namespace}"}) by(polaris_server_instance))`
            : 'max(sum(instance_isolate_count) by(polaris_server_instance))',
        boardFunction: LatestValueReduceFunction,
      },
      {
        name: '异常实例数',
        query:
          namespace && service
            ? `max(sum(instance_abnormal_count{namespace="${namespace}",service="${service}"}) by(polaris_server_instance))`
            : namespace
            ? `max(sum(instance_abnormal_count{namespace="${namespace}"}) by(polaris_server_instance))`
            : 'max(sum(instance_abnormal_count) by(polaris_server_instance))',
        boardFunction: LatestValueReduceFunction,
      },
    ]
  },
  [MetricName.ConfigGroup]: queryParam => {
    const { namespace } = queryParam
    return [
      {
        name: '配置分组总数',
        query: namespace
          ? `max(sum(config_group_count{namespace="${namespace}"}) by(polaris_server_instance))`
          : 'max(sum(config_group_count) by(polaris_server_instance))',
        boardFunction: LatestValueReduceFunction,
      },
    ]
  },
  [MetricName.ConfigFile]: queryParam => {
    const { namespace, configGroup } = queryParam
    return [
      {
        name: '配置文件数',
        query:
          namespace && configGroup
            ? `max(sum(config_file_count{namespace="${namespace}",group="${configGroup}"}) by(polaris_server_instance))`
            : namespace
            ? `max(sum(config_file_count{namespace="${namespace}"}) by(polaris_server_instance))`
            : 'max(sum(config_file_count) by(polaris_server_instance))',
        boardFunction: LatestValueReduceFunction,
      },
      {
        name: '已发布配置文件数',
        query:
          namespace && configGroup
            ? `max(sum(config_release_file_count{namespace="${namespace}",group="${configGroup}"}) by(polaris_server_instance))`
            : namespace
            ? `max(sum(config_release_file_count{namespace="${namespace}"}) by(polaris_server_instance))`
            : 'max(sum(config_release_file_count) by(polaris_server_instance))',
        boardFunction: LatestValueReduceFunction,
      },
    ]
  },
  [MetricName.ErrorReq]: (queryParam = {} as any) => {
    const { interfaceName, podName } = queryParam
    return [
      {
        name: '总失败请求数',
        query:
          interfaceName && podName
            ? `sum(client_rq_interval_count{err_code!~"2.+|0",api=~"${interfaceName}",polaris_server_instance="${podName}"})`
            : interfaceName
            ? `sum(client_rq_interval_count{err_code!~"2.+|0",api=~"${interfaceName}"})`
            : 'sum(client_rq_interval_count{err_code!~"2.+|0"})',
        boardFunction: SumUpReduceFunction,
      },
      {
        name: '5xx失败请求数',
        query:
          interfaceName && podName
            ? `sum(client_rq_interval_count{err_code=~"5.+",api=~"${interfaceName}",polaris_server_instance="${podName}"})`
            : interfaceName
            ? `sum(client_rq_interval_count{err_code=~"5.+",api=~"${interfaceName}"})`
            : 'sum(client_rq_interval_count{err_code=~"5.+"})',
        boardFunction: SumUpReduceFunction,
      },
      {
        name: '4xx失败请求数',
        query:
          interfaceName && podName
            ? `sum(client_rq_interval_count{err_code=~"4.+|0",api=~"${interfaceName},polaris_server_instance="${podName}"}) / sum(client_rq_interval_count{api=~"${interfaceName}",polaris_server_instance="${podName}})`
            : interfaceName
            ? `sum(client_rq_interval_count{err_code=~"4.+|0",api=~"${interfaceName}"}) / sum(client_rq_interval_count{api=~"${interfaceName}"})`
            : 'sum(client_rq_interval_count{err_code=~"4.+|0"}) / sum(client_rq_interval_count)',
        boardFunction: SumUpReduceFunction,
      },
    ]
  },
  [MetricName.RetCode]: (queryParam = {} as any) => {
    const { interfaceName, podName } = queryParam
    return [
      {
        name: '200',
        query:
          interfaceName && podName
            ? `sum(client_rq_interval_count{err_code=~"2.+|0",api=~"${interfaceName}",polaris_server_instance="${podName}"})`
            : interfaceName
            ? `sum(client_rq_interval_count{err_code=~"2.+|0",api=~"${interfaceName}"})`
            : 'sum(client_rq_interval_count{err_code=~"2.+|0"})',
        boardFunction: SumUpReduceFunction,
      },
      {
        name: '5xx',
        query:
          interfaceName && podName
            ? `sum(client_rq_interval_count{err_code=~"5.+",api=~"${interfaceName}",polaris_server_instance="${podName}"})`
            : interfaceName
            ? `sum(client_rq_interval_count{err_code=~"5.+",api=~"${interfaceName}"})`
            : 'sum(client_rq_interval_count{err_code=~"5.+"})',
        boardFunction: SumUpReduceFunction,
      },
      {
        name: '4xx',
        query:
          interfaceName && podName
            ? `sum(client_rq_interval_count{err_code=~"4.+|0",api=~"${interfaceName},polaris_server_instance="${podName}"}) / sum(client_rq_interval_count{api=~"${interfaceName}",polaris_server_instance="${podName}})`
            : interfaceName
            ? `sum(client_rq_interval_count{err_code=~"4.+|0",api=~"${interfaceName}"}) / sum(client_rq_interval_count{api=~"${interfaceName}"})`
            : 'sum(client_rq_interval_count{err_code=~"4.+|0"}) / sum(client_rq_interval_count)',
        boardFunction: SumUpReduceFunction,
      },
    ]
  },
}
export enum MonitorFeature {
  Register = 'Register',
  Discovery = 'Discovery',
  HealthCheck = 'HealthCheck',
  Config = 'Config',
  OpenAPI = 'OpenAPI',
}
export const MonitorFeatureTextMap = {
  [MonitorFeature.Register]: '服务注册',
  [MonitorFeature.Discovery]: '服务发现',
  [MonitorFeature.HealthCheck]: '健康检查',
  [MonitorFeature.Config]: '配置读取',
  [MonitorFeature.OpenAPI]: 'OpenAPI',
}
export const MonitorFeatureOptions = Object.entries(MonitorFeatureTextMap).map(([key, value]) => ({
  text: value,
  value: key,
}))
export function roundToN(value, n) {
  return Math.round(value * Math.pow(10, n)) / Math.pow(10, n)
}
